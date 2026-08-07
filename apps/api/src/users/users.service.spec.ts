import { expect, test } from "vite-plus/test";

import { DatabaseService } from "../database/database.service.js";
import { UsersService } from "./users.service.js";

test("persists and filters users in SQLite", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  service.createAdmin({
    displayName: "初始管理员",
    email: "admin@example.com",
    password: "ownerpass123",
    username: "admin",
  });

  const result = service.list({ keyword: "初始管理员", page: 1, pageSize: 10 });

  expect(result.meta.total).toBe(1);
  expect(result.items[0]?.username).toBe("admin");
  database.onModuleDestroy();
});

test("creates and updates a user", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  const user = service.create({
    displayName: "测试成员",
    email: "test@admin-x.dev",
    password: "tester123",
    role: "operator",
    username: "tester",
  });

  expect(service.count()).toBe(1);
  expect(service.updateStatus(user.id, "active").status).toBe("active");
  database.onModuleDestroy();
});
