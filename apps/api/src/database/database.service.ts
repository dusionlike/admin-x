import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";

import type {
  ActivityItem,
  AuditRecord,
  AuthUser,
  SecurityPolicy,
  UserRole,
} from "@admin-x/shared";

export interface AuditContext {
  ipAddress?: string;
  requestId?: string;
  userAgent?: string;
}

export interface StoredActivity {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  type: ActivityItem["type"];
}

export interface ActivityInput extends Omit<StoredActivity, "createdAt" | "id"> {
  action?: string;
  actor?: Pick<AuthUser, "id" | "displayName" | "role" | "username">;
  actorName?: string;
  actorUsername?: string;
  after?: unknown;
  before?: unknown;
  context?: AuditContext;
  resource?: string;
  result?: AuditRecord["result"];
  targetId?: string;
}

interface SqlRow {
  [key: string]: unknown;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('system-admin', 'security-admin', 'audit-admin', 'business-admin', 'operator', 'readonly')),
    status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
    avatar TEXT NOT NULL DEFAULT '',
    remark TEXT NOT NULL DEFAULT '',
    data_scope TEXT NOT NULL DEFAULT 'assigned',
    data_scope_ids TEXT NOT NULL DEFAULT '[]',
    mfa_enabled INTEGER NOT NULL DEFAULT 0,
    mfa_secret TEXT NOT NULL DEFAULT '',
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    session_version INTEGER NOT NULL DEFAULT 0,
    password_changed_at TEXT NOT NULL DEFAULT '',
    last_login_ip TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_active_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    actor_name TEXT NOT NULL DEFAULT '系统',
    actor_username TEXT,
    actor_role TEXT,
    action TEXT NOT NULL DEFAULT 'system',
    resource TEXT NOT NULL DEFAULT 'system',
    target_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('login', 'create', 'update', 'system')),
    result TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure', 'blocked')),
    before_json TEXT,
    after_json TEXT,
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    prev_hash TEXT,
    integrity_hash TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

  CREATE TABLE IF NOT EXISTS visit_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_visit_events_created_at ON visit_events(created_at DESC);

  CREATE TABLE IF NOT EXISTS security_policy (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_min_length INTEGER NOT NULL DEFAULT 8,
    password_max_age_days INTEGER NOT NULL DEFAULT 90,
    login_failure_limit INTEGER NOT NULL DEFAULT 5,
    lockout_minutes INTEGER NOT NULL DEFAULT 15,
    session_timeout_minutes INTEGER NOT NULL DEFAULT 30,
    concurrent_session_limit INTEGER NOT NULL DEFAULT 1,
    mfa_required_admin INTEGER NOT NULL DEFAULT 0,
    sensitive_action_reauth INTEGER NOT NULL DEFAULT 1,
    allowed_ip_ranges TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );

  INSERT OR IGNORE INTO security_policy (id, updated_at) VALUES (1, CURRENT_TIMESTAMP);

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, created_at DESC);
`;

export const DATABASE_PATH = Symbol("ADMIN_X_DATABASE_PATH");

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly connection: DatabaseSync;
  readonly databasePath: string;

  constructor(@Inject(DATABASE_PATH) databasePath = resolveDatabasePath()) {
    this.databasePath = databasePath;
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.connection = new DatabaseSync(databasePath);
    this.connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.connection.exec(SCHEMA);
    this.migrateExistingDatabase();
  }

  private migrateExistingDatabase(): void {
    this.migrateLegacyUserSchema();

    for (const [name, definition] of [
      ["avatar", "TEXT NOT NULL DEFAULT ''"],
      ["remark", "TEXT NOT NULL DEFAULT ''"],
      ["data_scope", "TEXT NOT NULL DEFAULT 'assigned'"],
      ["data_scope_ids", "TEXT NOT NULL DEFAULT '[]'"],
      ["mfa_enabled", "INTEGER NOT NULL DEFAULT 0"],
      ["mfa_secret", "TEXT NOT NULL DEFAULT ''"],
      ["failed_login_count", "INTEGER NOT NULL DEFAULT 0"],
      ["locked_until", "TEXT"],
      ["session_version", "INTEGER NOT NULL DEFAULT 0"],
      ["password_changed_at", "TEXT NOT NULL DEFAULT ''"],
      ["last_login_ip", "TEXT NOT NULL DEFAULT ''"],
    ] as const) {
      try {
        this.connection.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
      } catch {
        // The column already exists on a current database.
      }
    }

    for (const [name, definition] of [
      ["actor_id", "TEXT"],
      ["actor_name", "TEXT NOT NULL DEFAULT '系统'"],
      ["actor_username", "TEXT"],
      ["actor_role", "TEXT"],
      ["action", "TEXT NOT NULL DEFAULT 'system'"],
      ["resource", "TEXT NOT NULL DEFAULT 'system'"],
      ["target_id", "TEXT"],
      ["result", "TEXT NOT NULL DEFAULT 'success'"],
      ["before_json", "TEXT"],
      ["after_json", "TEXT"],
      ["ip_address", "TEXT"],
      ["user_agent", "TEXT"],
      ["request_id", "TEXT"],
      ["prev_hash", "TEXT"],
      ["integrity_hash", "TEXT"],
    ] as const) {
      try {
        this.connection.exec(`ALTER TABLE activity_logs ADD COLUMN ${name} ${definition}`);
      } catch {
        // The column already exists on a current database.
      }
    }
    this.connection.exec(
      `CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON activity_logs(actor_id);
       CREATE INDEX IF NOT EXISTS idx_activity_logs_result ON activity_logs(result);
       CREATE TRIGGER IF NOT EXISTS activity_logs_no_update
       BEFORE UPDATE ON activity_logs
       BEGIN
         SELECT RAISE(ABORT, 'audit logs are append-only');
       END;
       CREATE TRIGGER IF NOT EXISTS activity_logs_no_delete
       BEFORE DELETE ON activity_logs
       BEGIN
         SELECT RAISE(ABORT, 'audit logs are append-only');
       END;`,
    );
    this.connection.exec(
      `UPDATE users
       SET data_scope = 'all'
       WHERE role IN ('system-admin', 'security-admin', 'audit-admin', 'business-admin')
         AND data_scope = 'assigned';
       UPDATE users SET password_changed_at = created_at WHERE password_changed_at = '';`,
    );
  }

  private migrateLegacyUserSchema(): void {
    const row = this.connection
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get() as { sql?: string } | undefined;
    if (!row?.sql || row.sql.includes("'readonly'")) {
      return;
    }

    const rows = this.connection
      .prepare(
        `SELECT id, username, display_name, email, password_hash, role, status,
                avatar, remark, created_at, last_active_at
         FROM users`,
      )
      .all() as SqlRow[];

    this.connection.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;");
    try {
      this.connection.exec(`
        CREATE TABLE users_migrating (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL COLLATE NOCASE UNIQUE,
          display_name TEXT NOT NULL,
          email TEXT NOT NULL COLLATE NOCASE UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('system-admin', 'security-admin', 'audit-admin', 'business-admin', 'operator', 'readonly')),
          status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
          avatar TEXT NOT NULL DEFAULT '',
          remark TEXT NOT NULL DEFAULT '',
          data_scope TEXT NOT NULL DEFAULT 'assigned',
          data_scope_ids TEXT NOT NULL DEFAULT '[]',
          mfa_enabled INTEGER NOT NULL DEFAULT 0,
          mfa_secret TEXT NOT NULL DEFAULT '',
          failed_login_count INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          session_version INTEGER NOT NULL DEFAULT 0,
          password_changed_at TEXT NOT NULL DEFAULT '',
          last_login_ip TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          last_active_at TEXT
        );
      `);
      const insert = this.connection.prepare(
        `INSERT INTO users_migrating
          (id, username, display_name, email, password_hash, role, status, avatar, remark,
           data_scope, data_scope_ids, mfa_enabled, mfa_secret, failed_login_count, locked_until,
           session_version, password_changed_at, last_login_ip, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const legacy of rows) {
        insert.run(
          String(legacy.id),
          String(legacy.username),
          String(legacy.display_name),
          String(legacy.email),
          String(legacy.password_hash),
          mapLegacyRole(legacy.role),
          mapLegacyStatus(legacy.status),
          typeof legacy.avatar === "string" ? legacy.avatar : "",
          typeof legacy.remark === "string" ? legacy.remark : "",
          defaultDataScopeForRole(mapLegacyRole(legacy.role)),
          "[]",
          0,
          "",
          0,
          null,
          0,
          String(legacy.created_at),
          "",
          String(legacy.created_at),
          typeof legacy.last_active_at === "string" ? legacy.last_active_at : null,
        );
      }
      this.connection.exec(
        `DROP TABLE users;
         ALTER TABLE users_migrating RENAME TO users;
         CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);`,
      );
      this.connection.exec("COMMIT;");
    } catch (error) {
      try {
        this.connection.exec("ROLLBACK;");
      } catch {
        // Preserve the original migration error.
      }
      throw error;
    } finally {
      this.connection.exec("PRAGMA foreign_keys = ON;");
    }
  }

  addActivity(input: ActivityInput): void {
    const createdAt = new Date().toISOString();
    const previous = this.connection
      .prepare("SELECT integrity_hash FROM activity_logs ORDER BY rowid DESC LIMIT 1")
      .get() as { integrity_hash?: string } | undefined;
    const beforeJson = serializeAuditValue(input.before);
    const afterJson = serializeAuditValue(input.after);
    const prevHash = previous?.integrity_hash ?? "";
    const integrityHash = createHash("sha256")
      .update(
        JSON.stringify({
          action: input.action ?? input.type,
          actorId: input.actor?.id ?? null,
          actorName: input.actor?.displayName ?? input.actorName ?? "系统",
          actorRole: input.actor?.role ?? null,
          actorUsername: input.actor?.username ?? input.actorUsername ?? null,
          afterJson,
          beforeJson,
          createdAt,
          description: input.description,
          ipAddress: input.context?.ipAddress ?? null,
          prevHash,
          requestId: input.context?.requestId ?? null,
          resource: input.resource ?? "system",
          result: input.result ?? "success",
          targetId: input.targetId ?? null,
          title: input.title,
          type: input.type,
          userAgent: input.context?.userAgent ?? null,
        }),
      )
      .digest("hex");
    this.connection
      .prepare(
        `INSERT INTO activity_logs
          (id, actor_id, actor_name, actor_username, actor_role, action, resource, target_id,
           title, description, type, result, before_json, after_json, ip_address, user_agent,
           request_id, prev_hash, integrity_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.actor?.id ?? null,
        input.actor?.displayName ?? input.actorName ?? "系统",
        input.actor?.username ?? input.actorUsername ?? null,
        input.actor?.role ?? null,
        input.action ?? input.type,
        input.resource ?? "system",
        input.targetId ?? null,
        input.title,
        input.description,
        input.type,
        input.result ?? "success",
        beforeJson,
        afterJson,
        input.context?.ipAddress ?? null,
        input.context?.userAgent ?? null,
        input.context?.requestId ?? null,
        prevHash,
        integrityHash,
        createdAt,
      );
  }

  recordVisit(userId: string): void {
    this.connection
      .prepare("INSERT INTO visit_events (id, user_id, created_at) VALUES (?, ?, ?)")
      .run(randomUUID(), userId, new Date().toISOString());
  }

  getRecentActivities(limit: number, actorId?: string): StoredActivity[] {
    const condition = actorId ? "WHERE actor_id = ?" : "";
    const rows = this.connection
      .prepare(
        `SELECT id, title, description, type, created_at
         FROM activity_logs
         ${condition}
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(...(actorId ? [actorId, limit] : [limit])) as SqlRow[];

    return rows.map((row) => ({
      createdAt: String(row.created_at),
      description: String(row.description),
      id: String(row.id),
      title: String(row.title),
      type: row.type as ActivityItem["type"],
    }));
  }

  listAuditRecords(
    keyword: string,
    result: AuditRecord["result"] | "all",
    limit: number,
    offset: number,
  ): AuditRecord[] {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const conditions: string[] = [];
    const parameters: string[] = [];
    if (normalizedKeyword) {
      conditions.push(
        "(lower(actor_name) LIKE ? OR lower(actor_username) LIKE ? OR lower(title) LIKE ? OR lower(description) LIKE ? OR lower(resource) LIKE ?)",
      );
      parameters.push(...Array.from({ length: 5 }, () => `%${normalizedKeyword}%`));
    }
    if (result !== "all") {
      conditions.push("result = ?");
      parameters.push(result);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = this.connection
      .prepare(
        `SELECT id, actor_id, actor_name, actor_username, actor_role, action, resource, target_id,
                title, description, type, result, before_json, after_json, ip_address, user_agent,
                request_id, integrity_hash, created_at
         FROM activity_logs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...parameters, limit, offset) as SqlRow[];

    return rows.map((audit) => toAuditRecord(audit));
  }

  countAuditRecords(keyword: string, result: AuditRecord["result"] | "all"): number {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const conditions: string[] = [];
    const parameters: string[] = [];
    if (normalizedKeyword) {
      conditions.push(
        "(lower(actor_name) LIKE ? OR lower(actor_username) LIKE ? OR lower(title) LIKE ? OR lower(description) LIKE ? OR lower(resource) LIKE ?)",
      );
      parameters.push(...Array.from({ length: 5 }, () => `%${normalizedKeyword}%`));
    }
    if (result !== "all") {
      conditions.push("result = ?");
      parameters.push(result);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const row = this.connection
      .prepare(`SELECT COUNT(*) AS count FROM activity_logs ${whereClause}`)
      .get(...parameters) as SqlRow | undefined;
    return toNumber(row?.count);
  }

  getVisitCount(since: string, userId?: string): number {
    const condition = userId ? "created_at >= ? AND user_id = ?" : "created_at >= ?";
    const row = this.connection
      .prepare(`SELECT COUNT(*) AS count FROM visit_events WHERE ${condition}`)
      .get(...(userId ? [since, userId] : [since])) as SqlRow | undefined;
    return toNumber(row?.count);
  }

  getDailyVisits(since: string, userId?: string): Map<string, number> {
    const condition = userId ? "created_at >= ? AND user_id = ?" : "created_at >= ?";
    const rows = this.connection
      .prepare(
        `SELECT strftime('%Y-%m-%d', created_at) AS day, COUNT(*) AS count
         FROM visit_events
         WHERE ${condition}
         GROUP BY day
         ORDER BY day ASC`,
      )
      .all(...(userId ? [since, userId] : [since])) as SqlRow[];

    return new Map(rows.map((row) => [String(row.day), toNumber(row.count)]));
  }

  getSecurityPolicy(): SecurityPolicy {
    const row = this.connection
      .prepare(
        `SELECT password_min_length, password_max_age_days, login_failure_limit,
                lockout_minutes, session_timeout_minutes, concurrent_session_limit,
                mfa_required_admin, sensitive_action_reauth, allowed_ip_ranges
         FROM security_policy WHERE id = 1`,
      )
      .get() as SqlRow | undefined;
    return {
      allowedIpRanges: parseStringArray(row?.allowed_ip_ranges),
      concurrentSessionLimit: toNumber(row?.concurrent_session_limit) || 1,
      lockoutMinutes: toNumber(row?.lockout_minutes) || 15,
      loginFailureLimit: toNumber(row?.login_failure_limit) || 5,
      mfaRequiredForAdministrators: Boolean(toNumber(row?.mfa_required_admin)),
      passwordMaxAgeDays: toNumber(row?.password_max_age_days) || 90,
      passwordMinLength: toNumber(row?.password_min_length) || 8,
      sensitiveActionReauth: Boolean(toNumber(row?.sensitive_action_reauth)),
      sessionTimeoutMinutes: toNumber(row?.session_timeout_minutes) || 30,
    };
  }

  updateSecurityPolicy(policy: SecurityPolicy): void {
    this.connection
      .prepare(
        `UPDATE security_policy
         SET password_min_length = ?, password_max_age_days = ?, login_failure_limit = ?,
             lockout_minutes = ?, session_timeout_minutes = ?, concurrent_session_limit = ?,
             mfa_required_admin = ?, sensitive_action_reauth = ?, allowed_ip_ranges = ?,
             updated_at = ?
         WHERE id = 1`,
      )
      .run(
        policy.passwordMinLength,
        policy.passwordMaxAgeDays,
        policy.loginFailureLimit,
        policy.lockoutMinutes,
        policy.sessionTimeoutMinutes,
        policy.concurrentSessionLimit,
        policy.mfaRequiredForAdministrators ? 1 : 0,
        policy.sensitiveActionReauth ? 1 : 0,
        JSON.stringify(policy.allowedIpRanges),
        new Date().toISOString(),
      );
  }

  createSession(userId: string, sessionId: string, expiresAt: string, limit: number): void {
    const now = new Date().toISOString();
    this.connection
      .prepare(
        `UPDATE auth_sessions
         SET revoked_at = ?
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at <= ?`,
      )
      .run(now, userId, now);
    const sessions = this.connection
      .prepare(
        `SELECT id FROM auth_sessions
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC`,
      )
      .all(userId, now) as Array<{ id?: string }>;
    for (const session of sessions.slice(Math.max(0, limit - 1))) {
      if (session.id) {
        this.connection
          .prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?")
          .run(now, session.id);
      }
    }
    this.connection
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, created_at, last_seen_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(sessionId, userId, now, now, expiresAt);
  }

  isSessionActive(userId: string, sessionId: string): boolean {
    const now = new Date().toISOString();
    const row = this.connection
      .prepare(
        `SELECT id FROM auth_sessions
         WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?`,
      )
      .get(sessionId, userId, now) as { id?: string } | undefined;
    if (!row?.id) {
      return false;
    }
    this.connection
      .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?")
      .run(now, sessionId);
    return true;
  }

  revokeUserSessions(userId: string): void {
    this.connection
      .prepare("UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), userId);
  }

  isHealthy(): boolean {
    try {
      this.connection.prepare("SELECT 1").get();
      return true;
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.connection.close();
  }
}

export function resolveDatabasePath(): string {
  return process.env.DATABASE_PATH?.trim() || join(process.cwd(), "data", "admin-x.sqlite");
}

function toNumber(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function serializeAuditValue(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function toAuditRecord(row: SqlRow): AuditRecord {
  const result = row.result === "failure" || row.result === "blocked" ? row.result : "success";
  return {
    action: String(row.action),
    actorId: typeof row.actor_id === "string" ? row.actor_id : undefined,
    actorName: String(row.actor_name || "系统"),
    actorRole: typeof row.actor_role === "string" ? (row.actor_role as UserRole) : undefined,
    actorUsername: typeof row.actor_username === "string" ? row.actor_username : undefined,
    after: parseJson(row.after_json),
    before: parseJson(row.before_json),
    createdAt: String(row.created_at),
    description: String(row.description),
    id: String(row.id),
    integrityHash: typeof row.integrity_hash === "string" ? row.integrity_hash : undefined,
    ipAddress: typeof row.ip_address === "string" ? row.ip_address : undefined,
    requestId: typeof row.request_id === "string" ? row.request_id : undefined,
    resource: String(row.resource),
    result,
    targetId: typeof row.target_id === "string" ? row.target_id : undefined,
    title: String(row.title),
    type: row.type as AuditRecord["type"],
    userAgent: typeof row.user_agent === "string" ? row.user_agent : undefined,
  };
}

function defaultDataScopeForRole(role: UserRole): string {
  return role === "operator" || role === "readonly" ? "assigned" : "all";
}

function mapLegacyRole(value: unknown): UserRole {
  switch (value) {
    case "super-admin":
      return "system-admin";
    case "admin":
      return "business-admin";
    case "security-admin":
      return "security-admin";
    case "audit-admin":
      return "audit-admin";
    case "business-admin":
      return "business-admin";
    case "system-admin":
      return "system-admin";
    case "readonly":
      return "readonly";
    default:
      return "operator";
  }
}

function mapLegacyStatus(value: unknown): "active" | "invited" | "suspended" {
  return value === "active" || value === "suspended" ? value : "invited";
}
