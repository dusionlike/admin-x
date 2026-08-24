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
  BackupRecord,
  BackupTarget,
  SecurityPolicy,
  UserRole,
  VulnerabilityScanRecord,
} from "@admin-x/shared";

import {
  assertDataEncryptionKey,
  createSensitiveLookup,
  decryptSensitive,
  decryptSensitiveOptional,
  encryptSensitive,
  isSensitiveCiphertext,
} from "../security/data-protection.js";
import { maskAuditText } from "../security/audit-redaction.js";

export interface AuditContext {
  ipAddress?: string;
  requestId?: string;
  userAgent?: string;
}

export interface StoredEmailMfaConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordEncrypted: string;
  fromEmail: string;
  fromName: string;
  updatedAt: string;
}

export interface EmailMfaChallenge {
  id: string;
  userId: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
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
    email_lookup TEXT NOT NULL DEFAULT '',
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
    privacy_notice_accepted_at TEXT NOT NULL DEFAULT '',
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
    lockout_minutes INTEGER NOT NULL DEFAULT 30,
    session_timeout_minutes INTEGER NOT NULL DEFAULT 30,
    concurrent_session_limit INTEGER NOT NULL DEFAULT 1,
    mfa_required_admin INTEGER NOT NULL DEFAULT 0,
    sensitive_action_reauth INTEGER NOT NULL DEFAULT 1,
    allowed_ip_ranges TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );

  INSERT OR IGNORE INTO security_policy (id, updated_at) VALUES (1, CURRENT_TIMESTAMP);

  CREATE TABLE IF NOT EXISTS email_mfa_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER NOT NULL DEFAULT 0,
    smtp_host TEXT NOT NULL DEFAULT '',
    smtp_port INTEGER NOT NULL DEFAULT 587,
    smtp_secure INTEGER NOT NULL DEFAULT 0,
    smtp_user TEXT NOT NULL DEFAULT '',
    smtp_password_encrypted TEXT NOT NULL DEFAULT '',
    from_email TEXT NOT NULL DEFAULT '',
    from_name TEXT NOT NULL DEFAULT 'Admin X',
    updated_at TEXT NOT NULL
  );

  INSERT OR IGNORE INTO email_mfa_config (id, updated_at) VALUES (1, CURRENT_TIMESTAMP);

  CREATE TABLE IF NOT EXISTS email_mfa_challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at TEXT,
    created_at TEXT NOT NULL,
    request_ip TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_email_mfa_challenges_user
    ON email_mfa_challenges(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS backup_records (
    id TEXT PRIMARY KEY,
    target TEXT NOT NULL CHECK (target IN ('local', 'remote')),
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    path TEXT NOT NULL,
    checksum TEXT,
    size_bytes INTEGER,
    encrypted INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    retention_until TEXT,
    verified_at TEXT,
    verification_status TEXT CHECK (verification_status IN ('verified', 'failed')),
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_backup_records_created_at ON backup_records(created_at DESC);

  CREATE TABLE IF NOT EXISTS vulnerability_scans (
    id TEXT PRIMARY KEY,
    scanner TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
    critical_count INTEGER NOT NULL DEFAULT 0,
    high_count INTEGER NOT NULL DEFAULT 0,
    medium_count INTEGER NOT NULL DEFAULT 0,
    low_count INTEGER NOT NULL DEFAULT 0,
    scanned_at TEXT NOT NULL,
    report TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_vulnerability_scans_scanned_at ON vulnerability_scans(scanned_at DESC);
`;

export const DATABASE_PATH = Symbol("ADMIN_X_DATABASE_PATH");

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly connection: DatabaseSync;
  readonly databasePath: string;

  constructor(@Inject(DATABASE_PATH) databasePath = resolveDatabasePath()) {
    assertDataEncryptionKey();
    this.databasePath = databasePath;
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.connection = new DatabaseSync(databasePath);
    this.connection.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;",
    );
    this.connection.exec(SCHEMA);
    this.migrateExistingDatabase();
  }

  private migrateExistingDatabase(): void {
    this.migrateLegacyUserSchema();

    for (const [name, definition] of [
      ["avatar", "TEXT NOT NULL DEFAULT ''"],
      ["remark", "TEXT NOT NULL DEFAULT ''"],
      ["email_lookup", "TEXT NOT NULL DEFAULT ''"],
      ["data_scope", "TEXT NOT NULL DEFAULT 'assigned'"],
      ["data_scope_ids", "TEXT NOT NULL DEFAULT '[]'"],
      ["mfa_enabled", "INTEGER NOT NULL DEFAULT 0"],
      ["mfa_secret", "TEXT NOT NULL DEFAULT ''"],
      ["failed_login_count", "INTEGER NOT NULL DEFAULT 0"],
      ["locked_until", "TEXT"],
      ["session_version", "INTEGER NOT NULL DEFAULT 0"],
      ["password_changed_at", "TEXT NOT NULL DEFAULT ''"],
      ["privacy_notice_accepted_at", "TEXT NOT NULL DEFAULT ''"],
      ["last_login_ip", "TEXT NOT NULL DEFAULT ''"],
    ] as const) {
      try {
        this.connection.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
      } catch {
        // The column already exists on a current database.
      }
    }
    for (const [name, definition] of [
      ["verified_at", "TEXT"],
      ["verification_status", "TEXT"],
    ] as const) {
      try {
        this.connection.exec(`ALTER TABLE backup_records ADD COLUMN ${name} ${definition}`);
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
    // Encrypt legacy values before creating the append-only audit triggers;
    // the migration must be allowed to update existing audit rows once.
    this.connection.exec(
      "DROP TRIGGER IF EXISTS activity_logs_no_update; DROP TRIGGER IF EXISTS activity_logs_no_delete;",
    );
    this.migrateSensitiveStorage();
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
       UPDATE users SET password_changed_at = created_at WHERE password_changed_at = '';
       UPDATE users SET privacy_notice_accepted_at = created_at WHERE privacy_notice_accepted_at = '';
       UPDATE security_policy SET lockout_minutes = 30 WHERE lockout_minutes < 30;`,
    );
    this.connection.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lookup ON users(email_lookup)",
    );
  }

  private migrateSensitiveStorage(): void {
    this.connection.exec("BEGIN IMMEDIATE;");
    try {
      const users = this.connection
        .prepare(
          `SELECT id, display_name, email, email_lookup, avatar, remark, last_login_ip
           FROM users`,
        )
        .all() as SqlRow[];
      const updateUser = this.connection.prepare(
        `UPDATE users
         SET display_name = ?, email = ?, email_lookup = ?, avatar = ?, remark = ?, last_login_ip = ?
         WHERE id = ?`,
      );
      for (const row of users) {
        const email = decryptSensitive(row.email);
        updateUser.run(
          encryptStoredValue(row.display_name),
          encryptStoredValue(row.email),
          createSensitiveLookup(email.trim().toLowerCase()),
          encryptStoredValue(row.avatar),
          encryptStoredValue(row.remark),
          encryptStoredValue(row.last_login_ip),
          String(row.id),
        );
      }

      const auditRows = this.connection
        .prepare(
          `SELECT id, actor_name, actor_username, title, description, target_id,
                  before_json, after_json, ip_address, user_agent, request_id
           FROM activity_logs`,
        )
        .all() as SqlRow[];
      const updateAudit = this.connection.prepare(
        `UPDATE activity_logs
         SET actor_name = ?, actor_username = ?, title = ?, description = ?, target_id = ?,
             before_json = ?, after_json = ?, ip_address = ?, user_agent = ?, request_id = ?
         WHERE id = ?`,
      );
      for (const row of auditRows) {
        updateAudit.run(
          encryptStoredValue(row.actor_name),
          encryptStoredNullableValue(row.actor_username),
          encryptStoredValue(row.title),
          encryptStoredValue(row.description),
          encryptStoredNullableValue(row.target_id),
          encryptStoredNullableValue(row.before_json),
          encryptStoredNullableValue(row.after_json),
          encryptStoredNullableValue(row.ip_address),
          encryptStoredNullableValue(row.user_agent),
          encryptStoredNullableValue(row.request_id),
          String(row.id),
        );
      }
      this.connection.exec("COMMIT;");
    } catch (error) {
      try {
        this.connection.exec("ROLLBACK;");
      } catch {
        // Preserve the original migration error.
      }
      throw error;
    }
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
          email_lookup TEXT NOT NULL DEFAULT '',
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
          privacy_notice_accepted_at TEXT NOT NULL DEFAULT '',
          last_login_ip TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          last_active_at TEXT
        );
      `);
      const insert = this.connection.prepare(
        `INSERT INTO users_migrating
          (id, username, display_name, email, password_hash, role, status, avatar, remark,
           data_scope, data_scope_ids, mfa_enabled, mfa_secret, failed_login_count, locked_until,
           session_version, password_changed_at, privacy_notice_accepted_at, last_login_ip,
           created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        encryptStoredValue(input.actor?.displayName ?? input.actorName ?? "系统"),
        encryptStoredNullableValue(input.actor?.username ?? input.actorUsername),
        input.actor?.role ?? null,
        input.action ?? input.type,
        input.resource ?? "system",
        encryptStoredNullableValue(input.targetId),
        encryptStoredValue(input.title),
        encryptStoredValue(input.description),
        input.type,
        input.result ?? "success",
        encryptStoredNullableValue(beforeJson),
        encryptStoredNullableValue(afterJson),
        encryptStoredNullableValue(input.context?.ipAddress),
        encryptStoredNullableValue(input.context?.userAgent),
        encryptStoredNullableValue(input.context?.requestId),
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
      description: maskAuditText(decryptSensitive(row.description)),
      id: String(row.id),
      title: maskAuditText(decryptSensitive(row.title)),
      type: row.type as ActivityItem["type"],
    }));
  }

  listAuditRecords(
    keyword: string,
    result: AuditRecord["result"] | "all",
    limit: number,
    offset: number,
  ): AuditRecord[] {
    const records = this.filterAuditRecords(keyword, result);
    return records.slice(Math.max(0, offset), Math.max(0, offset) + Math.max(0, limit));
  }

  private filterAuditRecords(
    keyword: string,
    result: AuditRecord["result"] | "all",
  ): AuditRecord[] {
    const rows = this.connection
      .prepare(
        `SELECT id, actor_id, actor_name, actor_username, actor_role, action, resource, target_id,
                title, description, type, result, before_json, after_json, ip_address, user_agent,
                request_id, integrity_hash, created_at
         FROM activity_logs
         ${result === "all" ? "" : "WHERE result = ?"}
         ORDER BY created_at DESC`,
      )
      .all(...(result === "all" ? [] : [result])) as SqlRow[];
    const records = rows.map((audit) => toAuditRecord(audit));
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return records;
    }
    return records.filter((record) =>
      [
        record.action,
        record.actorName,
        record.actorUsername,
        record.title,
        record.description,
        record.resource,
      ].some((value) => value?.toLowerCase().includes(normalizedKeyword)),
    );
  }

  listAuditRecordsForActor(actorId: string, limit = 1000): AuditRecord[] {
    const rows = this.connection
      .prepare(
        `SELECT id, actor_id, actor_name, actor_username, actor_role, action, resource, target_id,
                title, description, type, result, before_json, after_json, ip_address, user_agent,
                request_id, integrity_hash, created_at
         FROM activity_logs
         WHERE actor_id = ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(actorId, Math.max(1, Math.min(limit, 5000))) as SqlRow[];
    return rows.map(toAuditRecord);
  }

  countAuditRecords(keyword: string, result: AuditRecord["result"] | "all"): number {
    return this.filterAuditRecords(keyword, result).length;
  }

  createBackupRecord(input: {
    path: string;
    retentionUntil?: string;
    target: BackupTarget;
  }): BackupRecord {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    this.connection
      .prepare(
        `INSERT INTO backup_records
          (id, target, status, path, encrypted, created_at, retention_until)
         VALUES (?, ?, 'running', ?, 1, ?, ?)`,
      )
      .run(id, input.target, input.path, createdAt, input.retentionUntil ?? null);
    return {
      createdAt,
      encrypted: true,
      id,
      path: input.path,
      retentionUntil: input.retentionUntil,
      status: "running",
      target: input.target,
    };
  }

  completeBackupRecord(
    id: string,
    input: { checksum: string; completedAt?: string; sizeBytes: number },
  ): BackupRecord {
    const completedAt = input.completedAt ?? new Date().toISOString();
    this.connection
      .prepare(
        `UPDATE backup_records
         SET status = 'success', checksum = ?, size_bytes = ?, completed_at = ?, error = NULL
         WHERE id = ?`,
      )
      .run(input.checksum, input.sizeBytes, completedAt, id);
    return this.getBackupRecord(id);
  }

  failBackupRecord(id: string, error: string): BackupRecord {
    this.connection
      .prepare(
        `UPDATE backup_records
         SET status = 'failed', completed_at = ?, error = ?
         WHERE id = ?`,
      )
      .run(new Date().toISOString(), error.slice(0, 500), id);
    return this.getBackupRecord(id);
  }

  listBackupRecords(limit = 50): BackupRecord[] {
    const rows = this.connection
      .prepare(
        `SELECT id, target, status, path, checksum, size_bytes, encrypted, created_at,
                completed_at, retention_until, verified_at, verification_status, error
         FROM backup_records ORDER BY created_at DESC LIMIT ?`,
      )
      .all(Math.max(1, Math.min(limit, 200))) as SqlRow[];
    return rows.map(toBackupRecord);
  }

  getBackupRecord(id: string): BackupRecord {
    const row = this.connection
      .prepare(
        `SELECT id, target, status, path, checksum, size_bytes, encrypted, created_at,
                completed_at, retention_until, verified_at, verification_status, error
         FROM backup_records WHERE id = ?`,
      )
      .get(id) as SqlRow | undefined;
    if (!row) {
      throw new Error("备份记录不存在");
    }
    return toBackupRecord(row);
  }

  markBackupVerification(id: string, valid: boolean): BackupRecord {
    this.connection
      .prepare(
        `UPDATE backup_records
         SET verified_at = ?, verification_status = ?
         WHERE id = ?`,
      )
      .run(new Date().toISOString(), valid ? "verified" : "failed", id);
    return this.getBackupRecord(id);
  }

  createVulnerabilityScan(input: {
    criticalCount: number;
    highCount: number;
    lowCount: number;
    mediumCount: number;
    report?: string;
    scanner: string;
    status: "passed" | "failed";
  }): VulnerabilityScanRecord {
    const record: VulnerabilityScanRecord = {
      criticalCount: input.criticalCount,
      highCount: input.highCount,
      id: randomUUID(),
      lowCount: input.lowCount,
      mediumCount: input.mediumCount,
      report: input.report,
      scannedAt: new Date().toISOString(),
      scanner: input.scanner,
      status: input.status,
    };
    this.connection
      .prepare(
        `INSERT INTO vulnerability_scans
          (id, scanner, status, critical_count, high_count, medium_count, low_count, scanned_at, report)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.scanner,
        record.status,
        record.criticalCount,
        record.highCount,
        record.mediumCount,
        record.lowCount,
        record.scannedAt,
        record.report ?? null,
      );
    return record;
  }

  listVulnerabilityScans(limit = 20): VulnerabilityScanRecord[] {
    const rows = this.connection
      .prepare(
        `SELECT id, scanner, status, critical_count, high_count, medium_count,
                low_count, scanned_at, report
         FROM vulnerability_scans ORDER BY scanned_at DESC LIMIT ?`,
      )
      .all(Math.max(1, Math.min(limit, 100))) as SqlRow[];
    return rows.map(toVulnerabilityScanRecord);
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
      lockoutMinutes: toNumber(row?.lockout_minutes) || 30,
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

  getEmailMfaConfig(): StoredEmailMfaConfig {
    const row = this.connection
      .prepare(
        `SELECT enabled, smtp_host, smtp_port, smtp_secure, smtp_user,
                smtp_password_encrypted, from_email, from_name, updated_at
         FROM email_mfa_config WHERE id = 1`,
      )
      .get() as SqlRow | undefined;
    return {
      enabled: Boolean(toNumber(row?.enabled)),
      fromEmail: String(row?.from_email ?? ""),
      fromName: String(row?.from_name || "Admin X"),
      smtpHost: String(row?.smtp_host ?? ""),
      smtpPasswordEncrypted: String(row?.smtp_password_encrypted ?? ""),
      smtpPort: toNumber(row?.smtp_port) || 587,
      smtpSecure: Boolean(toNumber(row?.smtp_secure)),
      smtpUser: String(row?.smtp_user ?? ""),
      updatedAt: String(row?.updated_at ?? ""),
    };
  }

  updateEmailMfaConfig(input: {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPasswordEncrypted: string;
    fromEmail: string;
    fromName: string;
  }): void {
    this.connection
      .prepare(
        `UPDATE email_mfa_config
         SET enabled = ?, smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_user = ?,
             smtp_password_encrypted = ?, from_email = ?, from_name = ?, updated_at = ?
         WHERE id = 1`,
      )
      .run(
        input.enabled ? 1 : 0,
        input.smtpHost,
        input.smtpPort,
        input.smtpSecure ? 1 : 0,
        input.smtpUser,
        input.smtpPasswordEncrypted,
        input.fromEmail,
        input.fromName,
        new Date().toISOString(),
      );
  }

  setEmailMfaEnabled(enabled: boolean): void {
    this.connection
      .prepare("UPDATE email_mfa_config SET enabled = ?, updated_at = ? WHERE id = 1")
      .run(enabled ? 1 : 0, new Date().toISOString());
  }

  createEmailMfaChallenge(input: {
    id: string;
    userId: string;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
    requestIp?: string;
  }): void {
    const now = new Date().toISOString();
    this.connection
      .prepare(
        `UPDATE email_mfa_challenges
         SET consumed_at = ?
         WHERE user_id = ? AND consumed_at IS NULL`,
      )
      .run(now, input.userId);
    this.connection
      .prepare(
        `INSERT INTO email_mfa_challenges
          (id, user_id, code_hash, expires_at, attempts, consumed_at, created_at, request_ip)
         VALUES (?, ?, ?, ?, 0, NULL, ?, ?)`,
      )
      .run(
        input.id,
        input.userId,
        input.codeHash,
        input.expiresAt,
        input.createdAt,
        input.requestIp ?? null,
      );
  }

  getLatestEmailMfaChallenge(userId: string, includeConsumed = false): EmailMfaChallenge | null {
    const consumedCondition = includeConsumed ? "" : "AND consumed_at IS NULL";
    const row = this.connection
      .prepare(
        `SELECT id, user_id, code_hash, expires_at, attempts, created_at
         FROM email_mfa_challenges
         WHERE user_id = ? ${consumedCondition}
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(userId) as SqlRow | undefined;
    if (!row) {
      return null;
    }
    return {
      attempts: toNumber(row.attempts),
      codeHash: String(row.code_hash),
      createdAt: String(row.created_at),
      expiresAt: String(row.expires_at),
      id: String(row.id),
      userId: String(row.user_id),
    };
  }

  incrementEmailMfaChallengeAttempts(id: string): void {
    this.connection
      .prepare("UPDATE email_mfa_challenges SET attempts = attempts + 1 WHERE id = ?")
      .run(id);
  }

  consumeEmailMfaChallenge(id: string): void {
    this.connection
      .prepare("UPDATE email_mfa_challenges SET consumed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  createSession(userId: string, sessionId: string, expiresAt: string, limit: number): void {
    const now = new Date().toISOString();
    this.connection
      .prepare(
        `DELETE FROM auth_sessions
         WHERE user_id = ? AND (revoked_at IS NOT NULL OR expires_at <= ?)`,
      )
      .run(userId, now);
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
          .prepare("DELETE FROM auth_sessions WHERE id = ? AND user_id = ?")
          .run(session.id, userId);
      }
    }
    this.connection
      .prepare(
        `INSERT INTO auth_sessions (id, user_id, created_at, last_seen_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(sessionId, userId, now, now, expiresAt);
  }

  isSessionActive(userId: string, sessionId: string, idleTimeoutSeconds?: number): boolean {
    const now = new Date().toISOString();
    const idleSince = idleTimeoutSeconds
      ? new Date(Date.now() - idleTimeoutSeconds * 1000).toISOString()
      : undefined;
    const row = this.connection
      .prepare(
        `SELECT id FROM auth_sessions
         WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > ?
           AND (? IS NULL OR last_seen_at > ?)`,
      )
      .get(sessionId, userId, now, idleSince ?? null, idleSince ?? "") as
      | { id?: string }
      | undefined;
    if (!row?.id) {
      if (idleSince) {
        this.connection
          .prepare(
            `DELETE FROM auth_sessions
             WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND last_seen_at <= ?`,
          )
          .run(sessionId, userId, idleSince);
      }
      return false;
    }
    this.connection
      .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?")
      .run(now, sessionId);
    return true;
  }

  revokeUserSessions(userId: string): void {
    this.connection.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
  }

  secureEraseStorage(): void {
    this.connection.exec(
      "PRAGMA secure_delete = ON; PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
    );
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
    try {
      this.connection.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } finally {
      this.connection.close();
    }
  }
}

export function resolveDatabasePath(): string {
  return process.env.DATABASE_PATH?.trim() || join(process.cwd(), "data", "admin-x.sqlite");
}

function toNumber(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function encryptStoredValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const text = String(value);
  return isSensitiveCiphertext(text) ? text : encryptSensitive(text);
}

function encryptStoredNullableValue(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value === "") {
    return "";
  }
  return encryptStoredValue(value);
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
  const actorName = decryptSensitive(row.actor_name || "系统");
  const actorUsername = decryptSensitiveOptional(row.actor_username);
  const afterJson = decryptSensitiveOptional(row.after_json);
  const beforeJson = decryptSensitiveOptional(row.before_json);
  const description = decryptSensitive(row.description);
  const ipAddress = decryptSensitiveOptional(row.ip_address);
  const requestId = decryptSensitiveOptional(row.request_id);
  const targetId = decryptSensitiveOptional(row.target_id);
  const title = decryptSensitive(row.title);
  const userAgent = decryptSensitiveOptional(row.user_agent);
  return {
    action: String(row.action),
    actorId: typeof row.actor_id === "string" ? row.actor_id : undefined,
    actorName,
    actorRole: typeof row.actor_role === "string" ? (row.actor_role as UserRole) : undefined,
    actorUsername,
    after: parseJson(afterJson),
    before: parseJson(beforeJson),
    createdAt: String(row.created_at),
    description,
    id: String(row.id),
    integrityHash: typeof row.integrity_hash === "string" ? row.integrity_hash : undefined,
    ipAddress,
    requestId,
    resource: String(row.resource),
    result,
    targetId,
    title,
    type: row.type as AuditRecord["type"],
    userAgent,
  };
}

function toBackupRecord(row: SqlRow): BackupRecord {
  return {
    checksum: typeof row.checksum === "string" ? row.checksum : undefined,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : undefined,
    createdAt: String(row.created_at),
    encrypted: Boolean(toNumber(row.encrypted)),
    error: typeof row.error === "string" ? row.error : undefined,
    id: String(row.id),
    path: String(row.path),
    retentionUntil: typeof row.retention_until === "string" ? row.retention_until : undefined,
    sizeBytes: row.size_bytes === null ? undefined : toNumber(row.size_bytes),
    status: row.status === "failed" || row.status === "success" ? row.status : "running",
    target: row.target === "remote" ? "remote" : "local",
    verificationStatus:
      row.verification_status === "verified" || row.verification_status === "failed"
        ? row.verification_status
        : undefined,
    verifiedAt: typeof row.verified_at === "string" ? row.verified_at : undefined,
  };
}

function toVulnerabilityScanRecord(row: SqlRow): VulnerabilityScanRecord {
  return {
    criticalCount: toNumber(row.critical_count),
    highCount: toNumber(row.high_count),
    id: String(row.id),
    lowCount: toNumber(row.low_count),
    mediumCount: toNumber(row.medium_count),
    report: typeof row.report === "string" ? row.report : undefined,
    scannedAt: String(row.scanned_at),
    scanner: String(row.scanner),
    status: row.status === "passed" ? "passed" : "failed",
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
