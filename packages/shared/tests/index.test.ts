import { expect, test } from "vite-plus/test";

import {
  canAccessData,
  createPageMeta,
  getAccountPasswordPolicyError,
  hasPermission,
  normalizePageQuery,
  toPositiveInt,
} from "../src/index.ts";

test("creates predictable pagination metadata", () => {
  expect(createPageMeta(25, 2, 10)).toEqual({
    page: 2,
    pageCount: 3,
    pageSize: 10,
    total: 25,
  });
});

test("normalizes user list query values", () => {
  expect(
    normalizePageQuery({
      keyword: "  Admin ",
      page: 0,
      pageSize: 999,
      status: "active",
    }),
  ).toEqual({
    keyword: "admin",
    page: 1,
    pageSize: 100,
    status: "active",
  });
});

test("falls back for non-positive numbers", () => {
  expect(toPositiveInt("not-a-number", 10)).toBe(10);
});

test("enforces the account password baseline by role", () => {
  expect(getAccountPasswordPolicyError("Aa1!short", { role: "system-admin" })).toBe(
    "密码长度不能少于 12 位",
  );
  expect(getAccountPasswordPolicyError("Aa1!short", { role: "operator" })).toBeNull();
  expect(getAccountPasswordPolicyError("longpassword", { role: "operator" })).toBe(
    "密码必须同时包含数字、大写字母、小写字母和特殊字符",
  );
  expect(getAccountPasswordPolicyError("lowercase123!", { role: "operator" })).toBe(
    "密码必须同时包含数字、大写字母、小写字母和特殊字符",
  );
  expect(getAccountPasswordPolicyError("Abcd1234!", { role: "operator" })).toBe(
    "密码过于简单，请避免使用连续字符",
  );
  expect(
    getAccountPasswordPolicyError("OwnerPass123!", {
      role: "system-admin",
      username: "admin",
    }),
  ).toBeNull();
});

test("keeps the four administrator boundaries separate", () => {
  expect(hasPermission("system-admin", "user:create")).toBe(true);
  expect(hasPermission("system-admin", "security:manage")).toBe(false);
  expect(hasPermission("security-admin", "role:assign")).toBe(true);
  expect(hasPermission("security-admin", "audit:read")).toBe(false);
  expect(hasPermission("audit-admin", "audit:read")).toBe(true);
  expect(hasPermission("audit-admin", "user:delete")).toBe(false);
  expect(hasPermission("business-admin", "business:manage")).toBe(true);
  expect(hasPermission("business-admin", "role:assign")).toBe(false);
});

test("applies data scope independently from menu permissions", () => {
  expect(
    canAccessData({ ids: [], type: "all" }, "user-1", {
      departmentId: "department-9",
      id: "record-1",
    }),
  ).toBe(true);
  expect(
    canAccessData({ ids: ["department-9"], type: "department" }, "user-1", {
      departmentId: "department-9",
      id: "record-1",
    }),
  ).toBe(true);
  expect(
    canAccessData({ ids: ["record-2"], type: "assigned" }, "user-1", {
      id: "record-1",
      ownerId: "user-2",
    }),
  ).toBe(false);
  expect(
    canAccessData({ ids: [], type: "self" }, "user-1", {
      id: "record-1",
      ownerId: "user-1",
    }),
  ).toBe(true);
});
