import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type {
  AuthUser,
  CreateUserRequest,
  PageResult,
  SetupAdminRequest,
  UserListQuery,
  UserRecord,
  UserRole,
  UserStatus,
} from "@admin-x/shared";
import { createPageMeta, normalizePageQuery } from "@admin-x/shared";

import { hashPassword } from "../auth/password.js";
import { DatabaseService } from "../database/database.service.js";

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
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
        `SELECT id, username, display_name, email, role, status, created_at, last_active_at
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

  create(input: CreateUserRequest): UserRecord {
    const user = this.insertUser({
      displayName: input.displayName,
      email: input.email,
      password: input.password,
      role: input.role,
      status: input.status ?? "invited",
      username: input.username,
    });
    this.database.addActivity({
      description: `新增成员 ${user.displayName}（@${user.username}）`,
      title: "创建了新用户",
      type: "create",
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
        role: "super-admin",
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

  updateStatus(id: string, status: UserStatus): UserRecord {
    const user = this.findById(id);
    this.database.connection.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
    const updatedUser = this.findById(id);
    this.database.addActivity({
      description: `${user.displayName} 的账号状态改为「${statusLabel(status)}」`,
      title: "更新了用户状态",
      type: "update",
    });
    return updatedUser;
  }

  remove(id: string): null {
    const user = this.findById(id);
    this.database.connection.prepare("DELETE FROM users WHERE id = ?").run(id);
    this.database.addActivity({
      description: `成员 ${user.displayName}（@${user.username}）已从工作区移除`,
      title: "删除了用户",
      type: "update",
    });
    return null;
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

  markLogin(id: string): void {
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
      description: `${row.display_name} · @${row.username}`,
      title: `${row.display_name} 登录了系统`,
      type: "login",
    });
  }

  private insertUser(input: {
    displayName: string;
    email: string;
    password: string;
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

    const id = randomUUID();
    const now = new Date().toISOString();
    this.database.connection
      .prepare(
        `INSERT INTO users
          (id, username, display_name, email, password_hash, role, status, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        username,
        displayName,
        email,
        hashPassword(input.password),
        input.role,
        input.status,
        now,
        null,
      );

    return this.findById(id);
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
        `SELECT id, username, display_name, email, password_hash, role, status, created_at, last_active_at
         FROM users WHERE id = ?`,
      )
      .get(id) as unknown as UserRow | undefined;
    return row ?? null;
  }

  private findRowByUsername(username: string): UserRow | null {
    const row = this.database.connection
      .prepare(
        `SELECT id, username, display_name, email, password_hash, role, status, created_at, last_active_at
         FROM users WHERE username = ?`,
      )
      .get(username.trim()) as unknown as UserRow | undefined;
    return row ?? null;
  }
}

function toPublicRecord(row: UserRow): UserRecord {
  return {
    createdAt: row.created_at.slice(0, 10),
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    lastActiveAt: formatLastActiveAt(row.last_active_at),
    role: row.role,
    status: row.status,
    username: row.username,
  };
}

function toAuthUser(row: UserRow): AuthUser {
  const user: AuthUser = {
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    role: row.role,
    username: row.username,
  };
  if (row.last_active_at) {
    user.lastLoginAt = row.last_active_at;
  }
  return user;
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

function toNumber(value: number | bigint | undefined): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}
