import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";

import type { ActivityItem } from "@admin-x/shared";

export interface StoredActivity {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  type: ActivityItem["type"];
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
    role TEXT NOT NULL CHECK (role IN ('super-admin', 'admin', 'operator')),
    status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
    created_at TEXT NOT NULL,
    last_active_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
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
  }

  addActivity(input: Omit<StoredActivity, "createdAt" | "id">): void {
    this.connection
      .prepare(
        `INSERT INTO activity_logs (id, title, description, type, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), input.title, input.description, input.type, new Date().toISOString());
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
