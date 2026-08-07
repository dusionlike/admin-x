import { expect, test } from "vite-plus/test";

import { createPageMeta, normalizePageQuery, toPositiveInt } from "../src/index.ts";

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
