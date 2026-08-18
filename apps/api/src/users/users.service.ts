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
  PageResult,
  SetupAdminRequest,
  UpdatePasswordRequest,
  UpdateProfileRequest,
  UserListQuery,
  UserRecord,
  UserRole,
  UserStatus,
} from "@admin-x/shared";
import {
  createPageMeta,
  getAccountPasswordPolicyError,
  isAdministratorRole,
  normalizePageQuery,
} from "@admin-x/shared";

import { hashPassword, verifyPassword } from "../auth/password.js";
import { DatabaseService } from "../database/database.service.js";

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
  created_at: string;
  last_active_at: string | null;
}

export interface AuthenticatedUserRecord {
  user: AuthUser;
  status: UserStatus;
}

@Injectable()
export class UsersService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  list(query: UserListQuery): PageResult<UserRecord> {
    const normalized = normalizePageQuery(query);
    const conditions: string[] = [];
    const parameters: string[] = [];

    if (normalized.status !== "all") {
      conditions.push("status = ?");
      parameters.push(normalized.status);
    }

    if (normalized.keyword) {
      const keyword = `%${normalized.keyword}%`;
      conditions.push(
        "(lower(display_name) LIKE ? OR lower(username) LIKE ? OR lower(email) LIKE ?)",
      );
      parameters.push(keyword, keyword, keyword);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const start = (normalized.page - 1) * normalized.pageSize;
    const rows = this.database.connection
      .prepare(
        `SELECT id, username, display_name, email, role, status, avatar, remark,
                created_at, last_active_at
         FROM users
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...parameters, normalized.pageSize, start) as unknown as UserRow[];
    const countRow = this.database.connection
      .prepare(`SELECT COUNT(*) AS count FROM users ${whereClause}`)
      .get(...parameters) as { count?: number | bigint } | undefined;

    return {
      items: rows.map((row) => toPublicRecord(row)),
      meta: createPageMeta(toNumber(countRow?.count), normalized.page, normalized.pageSize),
    };
  }

  create(input: CreateUserRequest, actor?: AuthUser): UserRecord {
    const bootstrapSecurityAdmin =
      input.role === "security-admin" && this.canBootstrapSecurityAdmin(actor);
    if (input.role !== "operator" && !bootstrapSecurityAdmin) {
      throw new ForbiddenException(
        "新账号默认只能创建为普通用户；首位安全管理员只能由系统管理员一次性初始化",
      );
    }
    const user = this.insertUser({
      displayName: input.displayName,
      email: input.email,
      password: input.password,
      remark: input.remark,
      role: input.role,
      status: bootstrapSecurityAdmin ? "active" : (input.status ?? "invited"),
      username: input.username,
    });
    this.database.addActivity({
      action: "user.create",
      actor: actor ? toAuditActor(actor) : undefined,
      description: `新增成员 ${user.displayName}（@${user.username}）`,
      title: "创建了新用户",
      type: "create",
      resource: "user",
    });
    return user;
  }

  createAdmin(input: SetupAdminRequest): UserRecord {
    this.database.connection.exec("BEGIN IMMEDIATE");
    try {
      if (this.count() > 0) {
        throw new ConflictException("系统已完成初始化，不能重复创建管理员");
      }

      const user = this.insertUser({
        displayName: input.displayName,
        email: input.email,
        password: input.password,
        role: "system-admin",
        status: "active",
        username: input.username,
      });
      this.database.addActivity({
        description: `初始管理员 ${user.displayName}（@${user.username}）已创建`,
        title: "完成初始管理员设置",
        type: "system",
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

  updateStatus(id: string, status: UserStatus, actor?: AuthUser): UserRecord {
    const user = this.findById(id);
    if (status === "suspended" && user.status !== "suspended") {
      if (actor?.id === id) {
        throw new ConflictException("不能停用当前登录账号");
      }
      if (isAdministratorRole(user.role)) {
        const activeAdminCount = this.database.connection
          .prepare(
            `SELECT COUNT(*) AS count FROM users
             WHERE status = 'active' AND role <> 'operator'`,
          )
          .get() as { count?: number | bigint } | undefined;
        if (Number(activeAdminCount?.count ?? 0) <= 1) {
          throw new ConflictException("至少保留一个正常的管理员账号");
        }
      }
    }
    if (user.status === status) {
      return user;
    }
    this.database.connection.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
    const updatedUser = this.findById(id);
    const actorLabel = actor ? `${actor.displayName}（@${actor.username}）` : "系统";
    this.database.addActivity({
      action: "user.status.update",
      actor: actor ? toAuditActor(actor) : undefined,
      description: `${actorLabel}将 ${user.displayName} 的账号状态改为「${statusLabel(status)}」`,
      title: "更新了用户状态",
      type: "update",
      resource: "user",
    });
    return updatedUser;
  }

  updateRole(id: string, role: UserRole, actor: AuthUser): UserRecord {
    if (actor.id === id) {
      throw new ConflictException("不能修改当前登录账号的角色");
    }
    if (actor.role !== "security-admin" && !this.canBootstrapRoleAssignment(actor, role)) {
      throw new ForbiddenException("只有安全管理员可以分配角色");
    }

    const current = this.findById(id);
    if (current.role === role) {
      return current;
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

    this.database.connection.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
    const updatedUser = this.findById(id);
    const bootstrap = actor.role === "system-admin" ? "（初始化授权）" : "";
    this.database.addActivity({
      action: "role.assign",
      actor: toAuditActor(actor),
      description: `${actor.displayName}（@${actor.username}）将 ${current.displayName} 的角色调整为「${roleLabel(role)}」${bootstrap}`,
      title: "调整了用户角色",
      type: "update",
      resource: "role",
    });
    return updatedUser;
  }

  updateProfile(id: string, input: UpdateProfileRequest): AuthUser {
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
      .prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND id <> ?")
      .get(email, id) as { id?: string } | undefined;
    if (duplicate?.id) {
      throw new ConflictException("邮箱已存在");
    }

    const avatar = normalizeAvatar(input.avatar ?? current.avatar);
    const remark = input.remark?.trim() ?? current.remark;
    this.database.connection
      .prepare("UPDATE users SET display_name = ?, email = ?, remark = ?, avatar = ? WHERE id = ?")
      .run(displayName, email, remark, avatar, id);

    this.database.addActivity({
      action: "profile.update",
      actor: toAuditActor({
        displayName,
        id,
        role: current.role,
        username: current.username,
      }),
      description: `${displayName}（@${current.username}）更新了个人资料`,
      title: "更新了个人资料",
      type: "update",
      resource: "profile",
    });
    return this.findAuthenticatedUser(id)!.user;
  }

  updateCurrentPassword(id: string, input: UpdatePasswordRequest): null {
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
    this.updatePassword(id, input.newPassword);
    return null;
  }

  updatePassword(id: string, password: string): void {
    const user = this.findRowById(id);
    if (!user) {
      throw new NotFoundException("用户不存在");
    }
    const passwordPolicyError = getAccountPasswordPolicyError(password, {
      role: user.role,
      username: user.username,
    });
    if (passwordPolicyError) {
      throw new BadRequestException(passwordPolicyError);
    }
    this.database.connection
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .run(hashPassword(password), id);
    this.database.addActivity({
      action: "password.update",
      actor: toAuditActor({
        displayName: user.display_name,
        id,
        role: user.role,
        username: user.username,
      }),
      description: `成员 ${user.display_name}（@${user.username}）的登录密码已更新`,
      title: "更新了用户密码",
      type: "update",
      resource: "password",
    });
  }

  remove(id: string, actor?: AuthUser): null {
    const user = this.findById(id);
    if (actor?.id === id) {
      throw new ConflictException("不能删除当前登录账号");
    }
    if (isAdministratorRole(user.role) && user.status === "active") {
      const activeAdminCount = this.database.connection
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE status = 'active' AND role <> 'operator'",
        )
        .get() as { count?: number | bigint } | undefined;
      if (Number(activeAdminCount?.count ?? 0) <= 1) {
        throw new ConflictException("至少保留一个正常的管理员账号");
      }
    }
    this.database.connection.prepare("DELETE FROM users WHERE id = ?").run(id);
    this.database.addActivity({
      action: "user.delete",
      actor: actor ? toAuditActor(actor) : undefined,
      description: `成员 ${user.displayName}（@${user.username}）已从工作区移除`,
      title: "删除了用户",
      type: "update",
      resource: "user",
    });
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

  findCredentials(username: string): { passwordHash: string; user: AuthUser } | null {
    const row = this.findRowByUsername(username);
    if (!row) {
      return null;
    }
    return {
      passwordHash: row.password_hash,
      user: toAuthUser(row),
    };
  }

  findAuthenticatedUser(id: string): AuthenticatedUserRecord | null {
    const row = this.findRowById(id);
    if (!row) {
      return null;
    }
    return {
      status: row.status,
      user: toAuthUser(row),
    };
  }

  markLogin(id: string, actor?: AuthUser): void {
    const now = new Date().toISOString();
    this.database.connection
      .prepare("UPDATE users SET last_active_at = ? WHERE id = ?")
      .run(now, id);
    const row = this.findRowById(id);
    if (!row) {
      return;
    }
    this.database.recordVisit(id);
    this.database.addActivity({
      action: "auth.login",
      actor: actor ? toAuditActor(actor) : undefined,
      description: `${row.display_name} · @${row.username}`,
      title: `${row.display_name} 登录了系统`,
      type: "login",
      resource: "auth",
    });
  }

  private insertUser(input: {
    displayName: string;
    email: string;
    password: string;
    remark?: string;
    role: UserRole;
    status: UserStatus;
    username: string;
  }): UserRecord {
    const displayName = input.displayName.trim();
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim();
    const existing = this.database.connection
      .prepare("SELECT username, email FROM users WHERE username = ? OR email = ?")
      .get(username, email) as { username?: string; email?: string } | undefined;

    if (existing?.username) {
      throw new ConflictException("用户名已存在");
    }
    if (existing?.email) {
      throw new ConflictException("邮箱已存在");
    }

    const passwordPolicyError = getAccountPasswordPolicyError(input.password, {
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
          (id, username, display_name, email, password_hash, role, status, avatar, remark,
           created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        username,
        displayName,
        email,
        hashPassword(input.password),
        input.role,
        input.status,
        "",
        input.remark ?? "",
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
      .prepare(
        `SELECT id, username, display_name, email, password_hash, role, status, avatar, remark,
                created_at, last_active_at
         FROM users WHERE id = ?`,
      )
      .get(id) as unknown as UserRow | undefined;
    return row ?? null;
  }

  private findRowByUsername(username: string): UserRow | null {
    const row = this.database.connection
      .prepare(
        `SELECT id, username, display_name, email, password_hash, role, status, avatar, remark,
                created_at, last_active_at
         FROM users WHERE username = ?`,
      )
      .get(username.trim()) as unknown as UserRow | undefined;
    return row ?? null;
  }
}

function toPublicRecord(row: UserRow): UserRecord {
  return {
    avatar: row.avatar || undefined,
    createdAt: row.created_at.slice(0, 10),
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    lastActiveAt: formatLastActiveAt(row.last_active_at),
    remark: row.remark,
    role: row.role,
    status: row.status,
    username: row.username,
  };
}

function toAuthUser(row: UserRow): AuthUser {
  const user: AuthUser = {
    avatar: row.avatar || undefined,
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    remark: row.remark,
    role: row.role,
    username: row.username,
  };
  if (row.last_active_at) {
    user.lastLoginAt = row.last_active_at;
  }
  return user;
}

function normalizeAvatar(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value !== "string" || value.length > 500_000) {
    throw new BadRequestException("头像文件过大");
  }
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw new BadRequestException("头像格式不正确");
  }
  return value;
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
  return {
    "audit-admin": "审计管理员",
    "business-admin": "业务管理员",
    operator: "普通用户",
    "security-admin": "安全管理员",
    "system-admin": "系统管理员",
  }[role];
}

function toAuditActor(actor: Pick<AuthUser, "id" | "displayName" | "role" | "username">) {
  return {
    displayName: actor.displayName,
    id: actor.id,
    role: actor.role,
  };
}

function toNumber(value: number | bigint | undefined): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}
