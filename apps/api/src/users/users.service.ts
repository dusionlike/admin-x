import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  AuthUser,
  CreateUserRequest,
  DataScope,
  DataScopeType,
  PageResult,
  PersonalDataExport,
  PasswordStatus,
  PrivacyConsentRequest,
  PrivacyEraseRequest,
  ResetUserPasswordRequest,
  SetupAdminRequest,
  UpdatePasswordRequest,
  UpdateProfileRequest,
  UpdateUserDataScopeRequest,
  UserListQuery,
  UserRecord,
  UserRole,
  UserStatus,
} from "@admin-x/shared";
import {
  createPageMeta,
  getAccountPasswordPolicyError,
  getRoleDefinition,
  isAdministratorRole,
  PASSWORD_EXPIRY_WARNING_DAYS,
  normalizePageQuery,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION,
} from "@admin-x/shared";

import { hashPassword, verifyPassword } from "../auth/password.js";
import { decryptMfaSecret, encryptMfaSecret } from "../auth/mfa.js";
import type { AuditContext } from "../database/database.service.js";
import { DatabaseService } from "../database/database.service.js";
import {
  createSensitiveLookup,
  decryptSensitive,
  encryptSensitive,
} from "../security/data-protection.js";
import { maskAuditRecords } from "../security/audit-redaction.js";
import { maskPersonalEmail } from "../privacy/privacy-policy.js";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  avatar: string;
  remark: string;
  data_scope: string;
  data_scope_ids: string;
  mfa_enabled: number;
  mfa_secret: string;
  failed_login_count: number;
  locked_until: string | null;
  session_version: number;
  password_changed_at: string;
  privacy_notice_accepted_at: string;
  privacy_notice_version: string;
  privacy_notice_summary: string;
  privacy_notice_ip: string;
  last_login_ip: string;
  created_at: string;
  last_active_at: string | null;
}

export interface AuthenticatedUserRecord {
  user: AuthUser;
  status: UserStatus;
  lockedUntil: string | null;
  passwordChangedAt: string;
  sessionVersion: number;
}

export interface LoginCredentials {
  passwordHash: string;
  user: AuthUser;
  failedLoginCount: number;
  lockedUntil: string | null;
  passwordChangedAt: string;
  sessionVersion: number;
}

const USER_COLUMNS = `
  id, username, display_name, email, password_hash, role, status, avatar, remark,
  data_scope, data_scope_ids, mfa_enabled, mfa_secret, failed_login_count, locked_until,
  session_version, password_changed_at, privacy_notice_accepted_at, privacy_notice_version,
  privacy_notice_summary, privacy_notice_ip, last_login_ip,
  created_at, last_active_at`;

@Injectable()
export class UsersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  list(query: UserListQuery, actor?: AuthUser, context?: AuditContext): PageResult<UserRecord> {
    const normalized = normalizePageQuery(query);
    const conditions: string[] = [];
    const parameters: string[] = [];

    if (normalized.status !== "all") {
      conditions.push("status = ?");
      parameters.push(normalized.status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.database.connection
      .prepare(
        `SELECT ${USER_COLUMNS}
         FROM users
         ${whereClause}
         ORDER BY created_at DESC`,
      )
      .all(...parameters)
      .map((row) => decryptUserRow(row as unknown as UserRow));
    const keyword = normalized.keyword.toLowerCase();
    const filteredRows = keyword
      ? rows.filter((row) =>
          [row.display_name, row.username, row.email].some((value) =>
            value.toLowerCase().includes(keyword),
          ),
        )
      : rows;
    const start = (normalized.page - 1) * normalized.pageSize;

    const result = {
      items: filteredRows
        .slice(start, start + normalized.pageSize)
        .map((row) => toPublicRecord(row, actor)),
      meta: createPageMeta(filteredRows.length, normalized.page, normalized.pageSize),
    };
    if (actor) {
      this.database.addActivity({
        action: "privacy.access",
        actor: toAuditActor(actor),
        after: {
          fields: ["登录用户名", "显示名称", "邮箱（按角色脱敏）", "岗位角色", "账号状态"],
          returnedCount: result.items.length,
          resource: "user-directory",
        },
        context,
        description: `${actor.displayName}（@${actor.username}）访问了成员目录，个人信息按岗位权限展示`,
        title: "访问个人信息目录",
        type: "system",
        resource: "privacy",
      });
    }
    return result;
  }

  create(input: CreateUserRequest, actor?: AuthUser, context?: AuditContext): UserRecord {
    const bootstrapSecurityAdmin =
      input.role === "security-admin" && this.canBootstrapSecurityAdmin(actor);
    const allowedInitialRole = input.role === "operator" || input.role === "readonly";
    if (input.role === "security-admin" && !bootstrapSecurityAdmin) {
      throw new ForbiddenException("首位安全管理员只能由系统管理员一次性初始化");
    }
    if (!allowedInitialRole && !bootstrapSecurityAdmin) {
      throw new ForbiddenException(
        "新账号默认只能创建为普通用户或查询用户；其他管理角色由安全管理员分配",
      );
    }

    const user = this.insertUser(
      {
        displayName: input.displayName,
        email: input.email,
        password: input.password,
        privacyNoticeAccepted: input.privacyNoticeAccepted,
        remark: input.remark,
        role: input.role,
        status: bootstrapSecurityAdmin ? "active" : (input.status ?? "invited"),
        username: input.username,
      },
      context,
    );
    this.database.addActivity({
      action: "user.create",
      actor: actor ? toAuditActor(actor) : undefined,
      after: auditUser(user),
      context,
      description: `新增成员 ${user.displayName}（@${user.username}）`,
      title: "创建了新用户",
      type: "create",
      resource: "user",
      targetId: user.id,
    });
    return user;
  }

  createAdmin(input: SetupAdminRequest, context?: AuditContext): UserRecord {
    this.database.connection.exec("BEGIN IMMEDIATE");
    try {
      if (this.count() > 0) {
        throw new ConflictException("系统已完成初始化，不能重复创建管理员");
      }

      const user = this.insertUser(
        {
          displayName: input.displayName,
          email: input.email,
          password: input.password,
          privacyNoticeAccepted: input.privacyNoticeAccepted,
          role: "system-admin",
          status: "active",
          username: input.username,
        },
        context,
      );
      this.database.addActivity({
        after: auditUser(user),
        context,
        description: `初始管理员 ${user.displayName}（@${user.username}）已创建`,
        title: "完成初始管理员设置",
        type: "system",
        resource: "auth",
        targetId: user.id,
      });
      this.database.connection.exec("COMMIT");
      return user;
    } catch (error) {
      try {
        this.database.connection.exec("ROLLBACK");
      } catch {
        // The transaction may already have been rolled back by SQLite.
      }
      throw error;
    }
  }

  updateStatus(
    id: string,
    status: UserStatus,
    actor?: AuthUser,
    context?: AuditContext,
  ): UserRecord {
    const current = this.findRowById(id);
    if (!current) {
      throw new NotFoundException("用户不存在");
    }
    if (status === "suspended" && current.status !== "suspended") {
      if (actor?.id === id) {
        throw new ConflictException("不能停用当前登录账号");
      }
      if (isAdministratorRole(current.role)) {
        const activeAdminCount = this.database.connection
          .prepare(
            `SELECT COUNT(*) AS count FROM users
             WHERE status = 'active' AND role NOT IN ('operator', 'readonly')`,
          )
          .get() as { count?: number | bigint } | undefined;
        if (Number(activeAdminCount?.count ?? 0) <= 1) {
          throw new ConflictException("至少保留一个正常的管理员账号");
        }
        if (
          (current.role === "security-admin" || current.role === "audit-admin") &&
          this.countActiveRole(current.role) <= 1
        ) {
          throw new ConflictException(`至少保留一个正常的${roleLabel(current.role)}`);
        }
      }
    }
    if (current.status === status) {
      return toPublicRecord(current);
    }

    this.database.connection
      .prepare(
        `UPDATE users
         SET status = ?, session_version = session_version + 1,
             locked_until = CASE WHEN ? = 'active' THEN NULL ELSE locked_until END
         WHERE id = ?`,
      )
      .run(status, status, id);
    this.database.revokeUserSessions(id);
    const updated = this.findRowById(id)!;
    const updatedUser = toPublicRecord(updated);
    const actorLabel = actor ? `${actor.displayName}（@${actor.username}）` : "系统";
    this.database.addActivity({
      action: "user.status.update",
      actor: actor ? toAuditActor(actor) : undefined,
      after: auditUser(updatedUser),
      before: auditUser(toPublicRecord(current)),
      context,
      description: `${actorLabel}将 ${current.display_name} 的账号状态改为「${statusLabel(status)}」`,
      title: "更新了用户状态",
      type: "update",
      resource: "user",
      targetId: id,
    });
    return updatedUser;
  }

  unlock(id: string, actor: AuthUser, context?: AuditContext): UserRecord {
    const current = this.findRowById(id);
    if (!current) {
      throw new NotFoundException("用户不存在");
    }
    this.database.connection
      .prepare(
        `UPDATE users
         SET failed_login_count = 0, locked_until = NULL, session_version = session_version + 1
         WHERE id = ?`,
      )
      .run(id);
    this.database.revokeUserSessions(id);
    const updated = toPublicRecord(this.findRowById(id)!);
    this.database.addActivity({
      action: "user.unlock",
      actor: toAuditActor(actor),
      after: auditUser(updated),
      before: auditUser(toPublicRecord(current)),
      context,
      description: `${actor.displayName}（@${actor.username}）解除了 ${current.display_name} 的登录锁定`,
      title: "解锁用户账号",
      type: "update",
      resource: "user",
      targetId: id,
    });
    return updated;
  }

  updateRole(id: string, role: UserRole, actor: AuthUser, context?: AuditContext): UserRecord {
    if (actor.id === id) {
      throw new ConflictException("不能修改当前登录账号的角色");
    }
    const current = this.findRowById(id);
    if (!current) {
      throw new NotFoundException("用户不存在");
    }
    if (
      actor.role === "security-admin" &&
      (role === "system-admin" || current.role === "system-admin")
    ) {
      throw new ForbiddenException("安全管理员不能授予或变更系统管理员角色");
    }
    if (actor.role !== "security-admin" && !this.canBootstrapRoleAssignment(actor, role)) {
      throw new ForbiddenException("只有安全管理员可以分配角色");
    }
    if (current.role === role) {
      return toPublicRecord(current);
    }
    if (current.role === "system-admin" && role !== "system-admin") {
      const activeSystemAdmins = this.database.connection
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'system-admin' AND status = 'active'",
        )
        .get() as { count?: number | bigint } | undefined;
      if (Number(activeSystemAdmins?.count ?? 0) <= 1) {
        throw new ConflictException("至少保留一个正常的系统管理员账号");
      }
    }

    this.database.connection
      .prepare(
        `UPDATE users
         SET role = ?, data_scope = ?, data_scope_ids = '[]',
             session_version = session_version + 1
         WHERE id = ?`,
      )
      .run(role, defaultDataScopeForRole(role), id);
    this.database.revokeUserSessions(id);
    const updated = this.findRowById(id)!;
    const updatedUser = toPublicRecord(updated);
    const bootstrap = actor.role === "system-admin" ? "（初始化授权）" : "";
    this.database.addActivity({
      action: "role.assign",
      actor: toAuditActor(actor),
      after: auditUser(updatedUser),
      before: auditUser(toPublicRecord(current)),
      context,
      description: `${actor.displayName}（@${actor.username}）将 ${current.display_name} 的角色调整为「${roleLabel(role)}」${bootstrap}`,
      title: "调整了用户角色",
      type: "update",
      resource: "role",
      targetId: id,
    });
    return updatedUser;
  }

  updateDataScope(
    id: string,
    input: UpdateUserDataScopeRequest,
    actor: AuthUser,
    context?: AuditContext,
  ): UserRecord {
    if (actor.role !== "security-admin") {
      throw new ForbiddenException("只有安全管理员可以配置数据权限");
    }
    const current = this.findRowById(id);
    if (!current) {
      throw new NotFoundException("用户不存在");
    }
    const dataScope = normalizeDataScope(input.dataScope);
    const previous = toPublicRecord(current);
    if (
      previous.dataScope.type === dataScope.type &&
      JSON.stringify(previous.dataScope.ids) === JSON.stringify(dataScope.ids)
    ) {
      return previous;
    }

    this.database.connection
      .prepare(
        `UPDATE users
         SET data_scope = ?, data_scope_ids = ?, session_version = session_version + 1
         WHERE id = ?`,
      )
      .run(dataScope.type, JSON.stringify(dataScope.ids), id);
    this.database.revokeUserSessions(id);
    const updatedUser = toPublicRecord(this.findRowById(id)!);
    this.database.addActivity({
      action: "data-scope.update",
      actor: toAuditActor(actor),
      after: auditUser(updatedUser),
      before: auditUser(previous),
      context,
      description: `${actor.displayName}（@${actor.username}）调整了 ${previous.displayName} 的数据范围为「${dataScopeLabel(dataScope)}」`,
      title: "调整了数据权限范围",
      type: "update",
      resource: "data-scope",
      targetId: id,
    });
    return updatedUser;
  }

  updateProfile(id: string, input: UpdateProfileRequest, context?: AuditContext): AuthUser {
    const current = this.findRowById(id);
    if (!current) {
      throw new NotFoundException("用户不存在");
    }

    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    if (!displayName) {
      throw new BadRequestException("显示名称不能为空");
    }
    const duplicate = this.database.connection
      .prepare("SELECT id FROM users WHERE email_lookup = ? AND id <> ?")
      .get(createSensitiveLookup(email), id) as { id?: string } | undefined;
    if (duplicate?.id) {
      throw new ConflictException("邮箱已存在");
    }

    const avatar = normalizeAvatar(input.avatar ?? current.avatar);
    const remark = input.remark?.trim() ?? current.remark;
    const before = toAuthUser(current);
    this.database.connection
      .prepare(
        `UPDATE users
         SET display_name = ?, email = ?, email_lookup = ?, remark = ?, avatar = ?
         WHERE id = ?`,
      )
      .run(
        encryptSensitive(displayName),
        encryptSensitive(email),
        createSensitiveLookup(email),
        encryptSensitive(remark),
        encryptSensitive(avatar),
        id,
      );

    const updated = this.findAuthenticatedUser(id)!.user;
    this.database.addActivity({
      action: "profile.update",
      actor: toAuditActor(updated),
      after: auditUser(updated),
      before: auditUser(before),
      context,
      description: `${displayName}（@${current.username}）更新了个人资料`,
      title: "更新了个人资料",
      type: "update",
      resource: "profile",
      targetId: id,
    });
    return updated;
  }

  updateCurrentPassword(id: string, input: UpdatePasswordRequest, context?: AuditContext): null {
    const current = this.findRowById(id);
    if (!current) {
      throw new NotFoundException("用户不存在");
    }
    if (!verifyPassword(input.currentPassword, current.password_hash)) {
      throw new UnauthorizedException("当前密码不正确");
    }
    if (input.currentPassword === input.newPassword) {
      throw new ConflictException("新密码不能与当前密码相同");
    }
    this.updatePassword(id, input.newPassword, context);
    return null;
  }

  resetPassword(
    id: string,
    input: ResetUserPasswordRequest,
    actor: AuthUser,
    context?: AuditContext,
  ): null {
    this.updatePassword(id, input.newPassword, context, actor);
    return null;
  }

  updatePassword(id: string, password: string, context?: AuditContext, actor?: AuthUser): void {
    const user = this.findRowById(id);
    if (!user) {
      throw new NotFoundException("用户不存在");
    }
    const passwordPolicy = this.database.getSecurityPolicy();
    const passwordPolicyError = getAccountPasswordPolicyError(password, {
      minimumLength: passwordPolicy.passwordMinLength,
      role: user.role,
      username: user.username,
    });
    if (passwordPolicyError) {
      throw new BadRequestException(passwordPolicyError);
    }
    const now = new Date().toISOString();
    this.database.connection
      .prepare(
        `UPDATE users
         SET password_hash = ?, password_changed_at = ?, failed_login_count = 0,
             locked_until = NULL, session_version = session_version + 1
         WHERE id = ?`,
      )
      .run(hashPassword(password), now, id);
    this.database.revokeUserSessions(id);
    const auditActor = actor ? toAuditActor(actor) : toAuditActor(toAuthUser(user));
    const isResetByAdministrator = Boolean(actor && actor.id !== id);
    this.database.addActivity({
      action: isResetByAdministrator ? "password.reset" : "password.update",
      actor: auditActor,
      context,
      description: isResetByAdministrator
        ? `${actor?.displayName}（@${actor?.username}）为成员 ${user.display_name}（@${user.username}）重置了登录密码，旧会话已失效`
        : `成员 ${user.display_name}（@${user.username}）的登录密码已更新，旧会话已失效`,
      title: isResetByAdministrator ? "重置了用户密码" : "更新了用户密码",
      type: "update",
      resource: "password",
      targetId: id,
    });
  }

  getPasswordStatus(id: string): PasswordStatus {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    const maxAgeDays = this.database.getSecurityPolicy().passwordMaxAgeDays;
    const base = {
      changedAt: row.password_changed_at,
      expiringSoon: false,
      expired: false,
      maxAgeDays,
    } satisfies PasswordStatus;
    if (maxAgeDays <= 0) {
      return base;
    }

    const changedAt = Date.parse(row.password_changed_at);
    if (!Number.isFinite(changedAt)) {
      return { ...base, expired: true };
    }

    const expiresAtTimestamp = changedAt + maxAgeDays * 86_400_000;
    const daysRemaining = Math.ceil((expiresAtTimestamp - Date.now()) / 86_400_000);
    const expired = daysRemaining <= 0;
    return {
      ...base,
      daysRemaining,
      expired,
      expiresAt: new Date(expiresAtTimestamp).toISOString(),
      expiringSoon: !expired && daysRemaining <= PASSWORD_EXPIRY_WARNING_DAYS,
    };
  }

  acceptPrivacyNotice(id: string, input: PrivacyConsentRequest, context?: AuditContext): AuthUser {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    if (input.accepted !== true) {
      throw new BadRequestException("必须先阅读并同意个人信息保护告知");
    }
    const acceptedAt = new Date().toISOString();
    this.database.connection
      .prepare(
        `UPDATE users
         SET privacy_notice_accepted_at = ?, privacy_notice_version = ?,
             privacy_notice_summary = ?, privacy_notice_ip = ?
         WHERE id = ?`,
      )
      .run(
        acceptedAt,
        PRIVACY_NOTICE_VERSION,
        PRIVACY_NOTICE_SUMMARY,
        context?.ipAddress ? encryptSensitive(context.ipAddress) : "",
        id,
      );
    const user = this.findAuthenticatedUser(id)!.user;
    this.database.addActivity({
      action: "privacy.notice.accept",
      actor: toAuditActor(user),
      after: { acceptedAt, version: PRIVACY_NOTICE_VERSION },
      context,
      description: `${user.displayName}（@${user.username}）确认了个人信息保护告知 ${PRIVACY_NOTICE_VERSION}`,
      title: "确认个人信息保护告知",
      type: "system",
      resource: "privacy",
      targetId: id,
    });
    return user;
  }

  exportPersonalData(id: string, context?: AuditContext): PersonalDataExport {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    const user = toAuthUser(row);
    const auditRecords = maskAuditRecords(this.database.listAuditRecordsForActor(id));
    const exportedAt = new Date().toISOString();
    this.database.addActivity({
      action: "privacy.export",
      actor: toAuditActor(user),
      context,
      description: `${user.displayName}（@${user.username}）导出了个人资料和审计记录`,
      title: "导出个人数据",
      type: "system",
      resource: "privacy",
      targetId: id,
    });
    return {
      auditRecords,
      exportedAt,
      privacyNotice: {
        acceptedAt: row.privacy_notice_accepted_at,
        summary: row.privacy_notice_summary,
        version: row.privacy_notice_version,
      },
      user,
    };
  }

  erasePersonalData(id: string, input: PrivacyEraseRequest, context?: AuditContext): null {
    const user = this.findRowById(id);
    if (!user) {
      throw new NotFoundException("用户不存在");
    }
    if (!verifyPassword(input.currentPassword, user.password_hash)) {
      throw new UnauthorizedException("当前密码不正确");
    }
    if (isAdministratorRole(user.role) && user.status === "active") {
      const activeAdminCount = this.database.connection
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE status = 'active' AND role NOT IN ('operator', 'readonly')",
        )
        .get() as { count?: number | bigint } | undefined;
      if (Number(activeAdminCount?.count ?? 0) <= 1) {
        throw new ConflictException("最后一个管理员账号不能注销，请先完成岗位交接");
      }
    }

    const snapshot = toAuthUser(user);
    this.database.revokeUserSessions(id);
    this.database.connection.prepare("DELETE FROM users WHERE id = ?").run(id);
    this.database.addActivity({
      action: "privacy.erase",
      actor: toAuditActor(snapshot),
      before: { id: snapshot.id, action: "privacy.erase" },
      context,
      description: "个人账号已按个人信息主体请求注销，业务个人资料已清除",
      title: "注销个人账号",
      type: "update",
      resource: "privacy",
      targetId: id,
    });
    this.database.secureEraseStorage();
    return null;
  }

  remove(id: string, actor?: AuthUser, context?: AuditContext): null {
    const user = this.findRowById(id);
    if (!user) {
      throw new NotFoundException("用户不存在");
    }
    if (actor?.id === id) {
      throw new ConflictException("不能删除当前登录账号");
    }
    if (isAdministratorRole(user.role) && user.status === "active") {
      const activeAdminCount = this.database.connection
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE status = 'active' AND role NOT IN ('operator', 'readonly')",
        )
        .get() as { count?: number | bigint } | undefined;
      if (Number(activeAdminCount?.count ?? 0) <= 1) {
        throw new ConflictException("至少保留一个正常的管理员账号");
      }
      if (
        (user.role === "security-admin" || user.role === "audit-admin") &&
        this.countActiveRole(user.role) <= 1
      ) {
        throw new ConflictException(`至少保留一个正常的${roleLabel(user.role)}`);
      }
    }
    const before = toPublicRecord(user);
    this.database.connection.prepare("DELETE FROM users WHERE id = ?").run(id);
    this.database.addActivity({
      action: "user.delete",
      actor: actor ? toAuditActor(actor) : undefined,
      before: auditUser(before),
      context,
      description: `成员 ${user.display_name}（@${user.username}）已从工作区移除`,
      title: "删除了用户",
      type: "update",
      resource: "user",
      targetId: id,
    });
    this.database.secureEraseStorage();
    return null;
  }

  get(id: string): UserRecord {
    return this.findById(id);
  }

  count(): number {
    const row = this.database.connection.prepare("SELECT COUNT(*) AS count FROM users").get() as
      | { count?: number | bigint }
      | undefined;
    return toNumber(row?.count);
  }

  countByStatus(status: UserStatus): number {
    const row = this.database.connection
      .prepare("SELECT COUNT(*) AS count FROM users WHERE status = ?")
      .get(status) as { count?: number | bigint } | undefined;
    return toNumber(row?.count);
  }

  private countActiveRole(role: UserRole): number {
    const row = this.database.connection
      .prepare("SELECT COUNT(*) AS count FROM users WHERE role = ? AND status = 'active'")
      .get(role) as { count?: number | bigint } | undefined;
    return toNumber(row?.count);
  }

  findCredentials(username: string): LoginCredentials | null {
    const row = this.findRowByUsername(username);
    if (!row) {
      return null;
    }
    return {
      failedLoginCount: toNumber(row.failed_login_count),
      lockedUntil: row.locked_until,
      passwordChangedAt: row.password_changed_at,
      passwordHash: row.password_hash,
      sessionVersion: toNumber(row.session_version),
      user: toAuthUser(row),
    };
  }

  findAuthenticatedUser(id: string): AuthenticatedUserRecord | null {
    const row = this.findRowById(id);
    if (!row) {
      return null;
    }
    return {
      lockedUntil: row.locked_until,
      passwordChangedAt: row.password_changed_at,
      sessionVersion: toNumber(row.session_version),
      status: row.status,
      user: toAuthUser(row),
    };
  }

  markLogin(id: string, actor?: AuthUser, context?: AuditContext): void {
    const now = new Date().toISOString();
    this.database.connection
      .prepare(
        `UPDATE users
         SET last_active_at = ?, last_login_ip = ?, failed_login_count = 0, locked_until = NULL
         WHERE id = ?`,
      )
      .run(now, encryptSensitive(context?.ipAddress ?? ""), id);
    const row = this.findRowById(id);
    if (!row) {
      return;
    }
    const loginActor = actor ?? toAuthUser(row);
    this.database.recordVisit(id);
    this.database.addActivity({
      action: "auth.login",
      actor: toAuditActor(loginActor),
      context,
      description: `${row.display_name} · @${row.username}`,
      title: `${row.display_name} 登录了系统`,
      type: "login",
      resource: "auth",
      targetId: id,
    });
  }

  recordLoginFailure(
    username: string,
    reason: string,
    context: AuditContext | undefined,
    lockedUntil?: string,
  ): { lockedUntil: string | null } {
    const row = this.findRowByUsername(username);
    if (!row) {
      this.database.addActivity({
        action: "auth.login.failure",
        actorName: "未知账号",
        actorUsername: username.trim(),
        context,
        description: `账号 ${username.trim()} 登录失败：${reason}`,
        result: "failure",
        title: "未知账号登录失败",
        type: "login",
        resource: "auth",
      });
      return { lockedUntil: null };
    }

    const nextCount = toNumber(row.failed_login_count) + 1;
    const nextLockedUntil = lockedUntil ?? row.locked_until;
    this.database.connection
      .prepare("UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?")
      .run(nextCount, nextLockedUntil, row.id);
    this.database.addActivity({
      action: "auth.login.failure",
      actor: toAuditActor(toAuthUser(row)),
      context,
      description: `${row.display_name}（@${row.username}）登录失败：${reason}`,
      result: nextLockedUntil ? "blocked" : "failure",
      title: nextLockedUntil ? "账号因连续失败已锁定" : "账号登录失败",
      type: "login",
      resource: "auth",
      targetId: row.id,
    });
    return { lockedUntil: nextLockedUntil };
  }

  getMfaStatus(id: string): { enabled: boolean; configured: boolean } {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    return { configured: Boolean(row.mfa_secret), enabled: Boolean(row.mfa_enabled) };
  }

  getMfaSecret(id: string): string {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    return decryptMfaSecret(row.mfa_secret);
  }

  saveMfaSecret(id: string, secret: string, context?: AuditContext): void {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    this.database.connection
      .prepare("UPDATE users SET mfa_secret = ? WHERE id = ?")
      .run(secret ? encryptMfaSecret(secret) : "", id);
    this.database.addActivity({
      action: "mfa.setup",
      actor: toAuditActor(toAuthUser(row)),
      context,
      description: `${row.display_name}（@${row.username}）生成了 MFA 绑定密钥`,
      title: "生成 MFA 绑定配置",
      type: "update",
      resource: "mfa",
      targetId: id,
    });
  }

  setMfaEnabled(id: string, enabled: boolean, context?: AuditContext): void {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    this.database.connection
      .prepare(
        "UPDATE users SET mfa_enabled = ?, session_version = session_version + 1 WHERE id = ?",
      )
      .run(enabled ? 1 : 0, id);
    this.database.revokeUserSessions(id);
    this.database.addActivity({
      action: enabled ? "mfa.enable" : "mfa.disable",
      actor: toAuditActor(toAuthUser(row)),
      context,
      description: `${row.display_name}（@${row.username}）${enabled ? "启用了" : "停用了"} MFA 多因素认证`,
      title: enabled ? "启用 MFA 多因素认证" : "停用 MFA 多因素认证",
      type: "update",
      resource: "mfa",
      targetId: id,
    });
  }

  verifyCurrentPassword(id: string, password: string): boolean {
    const row = this.findRowById(id);
    return Boolean(row && verifyPassword(password, row.password_hash));
  }

  invalidateSessions(id: string, actor?: AuthUser, context?: AuditContext): void {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    this.database.connection
      .prepare("UPDATE users SET session_version = session_version + 1 WHERE id = ?")
      .run(id);
    this.database.revokeUserSessions(id);
    this.database.addActivity({
      action: "auth.logout",
      actor: actor ? toAuditActor(actor) : toAuditActor(toAuthUser(row)),
      context,
      description: `${row.display_name}（@${row.username}）退出了当前会话`,
      title: "退出登录",
      type: "system",
      resource: "auth",
      targetId: id,
    });
  }

  private insertUser(
    input: {
      displayName: string;
      email: string;
      password: string;
      privacyNoticeAccepted: boolean;
      remark?: string;
      role: UserRole;
      status: UserStatus;
      username: string;
    },
    context?: AuditContext,
  ): UserRecord {
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    const existing = this.database.connection
      .prepare("SELECT username, email_lookup FROM users WHERE username = ? OR email_lookup = ?")
      .get(username, createSensitiveLookup(email)) as
      | { username?: string; email_lookup?: string }
      | undefined;

    if (existing?.username) {
      throw new ConflictException("用户名已存在");
    }
    if (existing?.email_lookup) {
      throw new ConflictException("邮箱已存在");
    }
    if (input.privacyNoticeAccepted !== true) {
      throw new BadRequestException("必须先阅读并同意个人信息保护告知");
    }

    const policy = this.database.getSecurityPolicy();
    const passwordPolicyError = getAccountPasswordPolicyError(input.password, {
      minimumLength: policy.passwordMinLength,
      role: input.role,
      username,
    });
    if (passwordPolicyError) {
      throw new BadRequestException(passwordPolicyError);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.connection
      .prepare(
        `INSERT INTO users
          (id, username, display_name, email, email_lookup, password_hash, role, status, avatar, remark,
           data_scope, data_scope_ids, mfa_enabled, mfa_secret, failed_login_count, locked_until,
           session_version, password_changed_at, privacy_notice_accepted_at, privacy_notice_version,
           privacy_notice_summary, privacy_notice_ip, last_login_ip, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        username,
        encryptSensitive(displayName),
        encryptSensitive(email),
        createSensitiveLookup(email),
        hashPassword(input.password),
        input.role,
        input.status,
        "",
        encryptSensitive(input.remark?.trim() ?? ""),
        defaultDataScopeForRole(input.role),
        "[]",
        0,
        "",
        0,
        null,
        0,
        now,
        now,
        PRIVACY_NOTICE_VERSION,
        PRIVACY_NOTICE_SUMMARY,
        context?.ipAddress ? encryptSensitive(context.ipAddress) : "",
        "",
        now,
        null,
      );

    return this.findById(id);
  }

  private canBootstrapSecurityAdmin(actor?: AuthUser): boolean {
    if (actor?.role !== "system-admin") {
      return false;
    }
    const activeSecurityAdmin = this.database.connection
      .prepare(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'security-admin' AND status = 'active'",
      )
      .get() as { count?: number | bigint } | undefined;
    return Number(activeSecurityAdmin?.count ?? 0) === 0;
  }

  private canBootstrapRoleAssignment(actor: AuthUser, role: UserRole): boolean {
    return role === "security-admin" && this.canBootstrapSecurityAdmin(actor);
  }

  private findById(id: string): UserRecord {
    const row = this.findRowById(id);
    if (!row) {
      throw new NotFoundException("用户不存在");
    }
    return toPublicRecord(row);
  }

  private findRowById(id: string): UserRow | null {
    const row = this.database.connection
      .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
      .get(id) as unknown as UserRow | undefined;
    return row ? decryptUserRow(row) : null;
  }

  private findRowByUsername(username: string): UserRow | null {
    const row = this.database.connection
      .prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`)
      .get(username.trim()) as unknown as UserRow | undefined;
    return row ? decryptUserRow(row) : null;
  }
}

function decryptUserRow(row: UserRow): UserRow {
  return {
    ...row,
    avatar: decryptSensitive(row.avatar),
    display_name: decryptSensitive(row.display_name),
    email: decryptSensitive(row.email),
    last_login_ip: decryptSensitive(row.last_login_ip),
    privacy_notice_ip: decryptSensitive(row.privacy_notice_ip),
    remark: decryptSensitive(row.remark),
  };
}

function toPublicRecord(row: UserRow, actor?: AuthUser): UserRecord {
  return {
    avatar: row.avatar || undefined,
    createdAt: row.created_at.slice(0, 10),
    dataScope: parseDataScope(row.data_scope, row.data_scope_ids, row.role),
    displayName: row.display_name,
    email: canViewFullEmail(row, actor) ? row.email : maskPersonalEmail(row.email),
    id: row.id,
    lastActiveAt: formatLastActiveAt(row.last_active_at),
    mfaEnabled: Boolean(row.mfa_enabled),
    remark: row.remark,
    role: row.role,
    status: row.status,
    username: row.username,
  };
}

function toAuthUser(row: UserRow): AuthUser {
  const user: AuthUser = {
    avatar: row.avatar || undefined,
    dataScope: parseDataScope(row.data_scope, row.data_scope_ids, row.role),
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    mfaEnabled: Boolean(row.mfa_enabled),
    privacyNoticeVersion: row.privacy_notice_version || undefined,
    remark: row.remark,
    role: row.role,
    username: row.username,
  };
  if (row.last_active_at) {
    user.lastLoginAt = row.last_active_at;
  }
  return user;
}

function canViewFullEmail(row: UserRow, actor?: AuthUser): boolean {
  return !actor || actor.role === "system-admin" || actor.id === row.id;
}

function auditUser(user: UserRecord | AuthUser): Record<string, unknown> {
  return {
    dataScope: user.dataScope,
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    mfaEnabled: user.mfaEnabled,
    role: user.role,
    status: "status" in user ? user.status : undefined,
    username: user.username,
  };
}

function normalizeAvatar(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value !== "string" || value.length > 500_000) {
    throw new BadRequestException("头像文件过大");
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/u.exec(value);
  if (!match) {
    throw new BadRequestException("头像格式不正确");
  }
  const [, mime = "", encoded = ""] = match;
  if (!/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded) || encoded.length % 4 === 1) {
    throw new BadRequestException("头像编码不正确");
  }
  const bytes = Buffer.from(encoded, "base64");
  const hasPngSignature = bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  const hasJpegSignature = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const hasWebpSignature =
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const signatureMatchesMime =
    (mime === "png" && hasPngSignature) ||
    (mime === "jpeg" && hasJpegSignature) ||
    (mime === "webp" && hasWebpSignature);
  if (!signatureMatchesMime) {
    throw new BadRequestException("头像内容未通过文件签名校验");
  }
  return value;
}

function parseDataScope(value: string, rawIds: string, role: UserRole): DataScope {
  const types: DataScopeType[] = [
    "all",
    "organization",
    "department",
    "project",
    "assigned",
    "self",
  ];
  const type = types.includes(value as DataScopeType)
    ? (value as DataScopeType)
    : defaultDataScopeForRole(role);
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(rawIds) as unknown;
    if (Array.isArray(parsed)) {
      ids = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    ids = [];
  }
  return { ids, type };
}

function normalizeDataScope(input: DataScope): DataScope {
  const types: DataScopeType[] = [
    "all",
    "organization",
    "department",
    "project",
    "assigned",
    "self",
  ];
  if (!types.includes(input.type)) {
    throw new BadRequestException("数据范围类型不合法");
  }
  const ids = Array.from(
    new Set(
      (input.ids ?? [])
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );
  if (input.type !== "all" && input.type !== "self" && ids.length === 0) {
    throw new BadRequestException("指定数据范围时至少需要一个范围编号");
  }
  if (ids.length > 100) {
    throw new BadRequestException("数据范围编号不能超过 100 个");
  }
  return { ids: input.type === "all" || input.type === "self" ? [] : ids, type: input.type };
}

function defaultDataScopeForRole(role: UserRole): DataScopeType {
  return getRoleDefinition(role).defaultDataScope;
}

function dataScopeLabel(scope: DataScope): string {
  return {
    all: "全部数据",
    assigned: "指定数据",
    department: "本部门",
    organization: "本单位",
    project: "指定项目",
    self: "本人数据",
  }[scope.type];
}

function formatLastActiveAt(value: string | null): string {
  if (!value) {
    return "尚未登录";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return "刚刚";
  }
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "昨天" : `${days} 天前`;
}

function statusLabel(status: UserStatus): string {
  return {
    active: "正常",
    invited: "待激活",
    suspended: "已停用",
  }[status];
}

function roleLabel(role: UserRole): string {
  return getRoleDefinition(role).label;
}

function toAuditActor(actor: Pick<AuthUser, "id" | "displayName" | "role" | "username">) {
  return {
    displayName: actor.displayName,
    id: actor.id,
    role: actor.role,
    username: actor.username,
  };
}

function toNumber(value: number | bigint | undefined): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}
