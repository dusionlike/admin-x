import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";

import type { ActivityItem, AuditRecord, AuthUser, UserRole } from "@admin-x/shared";

export interface StoredActivity {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  type: ActivityItem["type"];
}

export interface ActivityInput extends Omit<StoredActivity, "createdAt" | "id"> {
  action?: string;
  actor?: Pick<AuthUser, "id" | "displayName" | "role">;
  resource?: string;
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
    role TEXT NOT NULL CHECK (role IN ('system-admin', 'security-admin', 'audit-admin', 'business-admin', 'operator')),
    status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
    avatar TEXT NOT NULL DEFAULT '',
    remark TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_active_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT,
    actor_name TEXT NOT NULL DEFAULT '系统',
    actor_role TEXT,
    action TEXT NOT NULL DEFAULT 'system',
    resource TEXT NOT NULL DEFAULT 'system',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('login', 'create', 'update', 'system')),
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

  CREATE TABLE IF NOT EXISTS visit_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_visit_events_created_at ON visit_events(created_at DESC);
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
      ["actor_role", "TEXT"],
      ["action", "TEXT NOT NULL DEFAULT 'system'"],
      ["resource", "TEXT NOT NULL DEFAULT 'system'"],
    ] as const) {
      try {
        this.connection.exec(`ALTER TABLE activity_logs ADD COLUMN ${name} ${definition}`);
      } catch {
        // The column already exists on a current database.
      }
    }
    this.connection.exec(
      "CREATE INDEX IF NOT EXISTS idx_activity_logs_actor_id ON activity_logs(actor_id)",
    );
  }

  private migrateLegacyUserSchema(): void {
    const row = this.connection
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get() as { sql?: string } | undefined;
    if (!row?.sql || row.sql.includes("'system-admin'")) {
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
          role TEXT NOT NULL CHECK (role IN ('system-admin', 'security-admin', 'audit-admin', 'business-admin', 'operator')),
          status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
          avatar TEXT NOT NULL DEFAULT '',
          remark TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          last_active_at TEXT
        );
      `);
      const insert = this.connection.prepare(
        `INSERT INTO users_migrating
          (id, username, display_name, email, password_hash, role, status, avatar, remark,
           created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    this.connection
      .prepare(
        `INSERT INTO activity_logs
          (id, actor_id, actor_name, actor_role, action, resource, title, description, type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.actor?.id ?? null,
        input.actor?.displayName ?? "系统",
        input.actor?.role ?? null,
        input.action ?? input.type,
        input.resource ?? "system",
        input.title,
        input.description,
        input.type,
        new Date().toISOString(),
      );
  }

  recordVisit(userId: string): void {
    this.connection
      .prepare("INSERT INTO visit_events (id, user_id, created_at) VALUES (?, ?, ?)")
      .run(randomUUID(), userId, new Date().toISOString());
  }

  getRecentActivities(limit: number): StoredActivity[] {
    const rows = this.connection
      .prepare(
        `SELECT id, title, description, type, created_at
         FROM activity_logs
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(limit) as SqlRow[];

    return rows.map((row) => ({
      createdAt: String(row.created_at),
      description: String(row.description),
      id: String(row.id),
      title: String(row.title),
      type: row.type as ActivityItem["type"],
    }));
  }

  listAuditRecords(keyword: string, limit: number, offset: number): AuditRecord[] {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const whereClause = normalizedKeyword
      ? "WHERE lower(actor_name) LIKE ? OR lower(title) LIKE ? OR lower(description) LIKE ? OR lower(resource) LIKE ?"
      : "";
    const parameters = normalizedKeyword
      ? Array.from({ length: 4 }, () => `%${normalizedKeyword}%`)
      : [];
    const rows = this.connection
      .prepare(
        `SELECT id, actor_id, actor_name, actor_role, action, resource, title, description,
                type, created_at
         FROM activity_logs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...parameters, limit, offset) as SqlRow[];

    return rows.map((audit) => ({
      action: String(audit.action),
      actorId: typeof audit.actor_id === "string" ? audit.actor_id : undefined,
      actorName: String(audit.actor_name || "系统"),
      actorRole: typeof audit.actor_role === "string" ? (audit.actor_role as UserRole) : undefined,
      createdAt: String(audit.created_at),
      description: String(audit.description),
      id: String(audit.id),
      resource: String(audit.resource),
      title: String(audit.title),
      type: audit.type as AuditRecord["type"],
    }));
  }

  countAuditRecords(keyword: string): number {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const whereClause = normalizedKeyword
      ? "WHERE lower(actor_name) LIKE ? OR lower(title) LIKE ? OR lower(description) LIKE ? OR lower(resource) LIKE ?"
      : "";
    const parameters = normalizedKeyword
      ? Array.from({ length: 4 }, () => `%${normalizedKeyword}%`)
      : [];
    const row = this.connection
      .prepare(`SELECT COUNT(*) AS count FROM activity_logs ${whereClause}`)
      .get(...parameters) as SqlRow | undefined;
    return toNumber(row?.count);
  }

  getVisitCount(since: string): number {
    const row = this.connection
      .prepare("SELECT COUNT(*) AS count FROM visit_events WHERE created_at >= ?")
      .get(since) as SqlRow | undefined;
    return toNumber(row?.count);
  }

  getDailyVisits(since: string): Map<string, number> {
    const rows = this.connection
      .prepare(
        `SELECT strftime('%Y-%m-%d', created_at) AS day, COUNT(*) AS count
         FROM visit_events
         WHERE created_at >= ?
         GROUP BY day
         ORDER BY day ASC`,
      )
      .all(since) as SqlRow[];

    return new Map(rows.map((row) => [String(row.day), toNumber(row.count)]));
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
    default:
      return "operator";
  }
}

function mapLegacyStatus(value: unknown): "active" | "invited" | "suspended" {
  return value === "active" || value === "suspended" ? value : "invited";
}
