import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";

type JsonObject = Record<string, unknown>;
type ApiResult = { body: JsonObject; headers: Headers; status: number };

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const apiDir = join(rootDir, "apps", "api");
const port = 3307;
const appOrigin = `http://127.0.0.1:${port}`;
const baseUrl = `http://127.0.0.1:${port}/api`;
const systemPassword = "SystemAdminPass123!";
const securityPassword = "SecurityAdminPass123!";
const auditPassword = "AuditAdminPass123!";
const operatorPassword = "OperatorPass123!";

let server: ChildProcess | undefined;
let dataDir = "";

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "admin-x-e2e-"));
  const env = {
    ...process.env,
    BACKUP_ENCRYPTION_KEY: "e2e-dedicated-backup-key",
    BACKUP_LOCAL_PATH: join(dataDir, "local-backups"),
    BACKUP_REMOTE_PATH: join(dataDir, "remote-backups"),
    DATABASE_PATH: join(dataDir, "admin-x.sqlite"),
    FRONTEND_ORIGIN: `http://127.0.0.1:${port}`,
    HA_ENABLED: "true",
    INSTANCE_ID: "admin-x-e2e",
    MALWARE_SCAN_MODE: "signature-and-content",
    NODE_ENV: "test",
    PORT: String(port),
    SECURE_TRANSPORT_REQUIRED: "true",
    JWT_SECRET: "e2e-long-random-jwt-secret-for-tests",
  };
  server = spawn(process.execPath, ["--import", "tsx/esm", "src/main.ts"], {
    cwd: apiDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();
});

after(async () => {
  if (server) {
    const processToStop = server;
    processToStop.kill();
    await new Promise<void>((resolvePromise) => {
      if (processToStop.exitCode !== null) {
        resolvePromise();
        return;
      }
      processToStop.once("exit", () => resolvePromise());
      setTimeout(() => {
        processToStop.kill("SIGKILL");
        resolvePromise();
      }, 1_000);
    });
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(dataDir, { force: true, recursive: true });
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
});

test("等级保护设计检查清单的 18 项控制均可通过端到端流程验证", async () => {
  const health = await request("/health");
  assert.equal(health.status, 200);
  assert.equal((health.body.data as JsonObject).status, "ok");
  assert.match(health.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/u);
  assert.match(health.headers.get("strict-transport-security") ?? "", /max-age=31536000/u);
  const ready = await request("/ready");
  assert.equal(ready.status, 200);
  assert.equal((ready.body.data as JsonObject).highAvailability, true);

  const insecure = await request("/health", { secure: false });
  assert.equal(insecure.status, 426);

  const setup = await request("/auth/setup", {
    body: {
      displayName: "系统管理员",
      email: "system-admin@admin-x.example",
      password: systemPassword,
      privacyNoticeAccepted: true,
      username: "system-owner",
    },
    method: "POST",
  });
  assert.ok(setup.status === 200 || setup.status === 201, JSON.stringify(setup.body));
  let systemToken = tokenFrom(setup);

  const unknownInput = await request("/auth/login", {
    body: {
      password: systemPassword,
      unexpectedField: true,
      username: "system-owner",
    },
    method: "POST",
  });
  assert.equal(unknownInput.status, 400);
  const invalidUserQuery = await authorizedRequest("/users?page=not-a-number", systemToken);
  assert.equal(invalidUserQuery.status, 400);
  const invalidOrigin = await request("/auth/login", {
    body: { password: systemPassword, username: "system-owner" },
    method: "POST",
    origin: "https://malicious.example",
  });
  assert.equal(invalidOrigin.status, 403);

  const systemMfaSetup = await request("/auth/mfa/setup", {
    body: { currentPassword: systemPassword },
    method: "POST",
    token: systemToken,
  });
  const systemSecret = stringFrom(systemMfaSetup, "secret");
  await request("/auth/mfa/enable", {
    body: { code: createTotp(systemSecret) },
    method: "POST",
    token: systemToken,
  });
  systemToken = tokenFrom(
    await request("/auth/login", {
      body: {
        mfaCode: createTotp(systemSecret),
        password: systemPassword,
        username: "system-owner",
      },
      method: "POST",
    }),
  );

  const unsignedMutation = await request("/auth/reauth", {
    body: { currentPassword: systemPassword },
    method: "POST",
    sign: false,
    token: systemToken,
  });
  assert.equal(unsignedMutation.status, 401);

  const securityCreate = await sensitiveRequest(systemToken, systemPassword, "/users", {
    body: {
      displayName: "安全管理员",
      email: "security-admin@admin-x.example",
      password: securityPassword,
      privacyNoticeAccepted: true,
      role: "security-admin",
      status: "active",
      username: "security-owner",
    },
    method: "POST",
  });
  assert.ok(
    securityCreate.status === 200 || securityCreate.status === 201,
    JSON.stringify(securityCreate.body),
  );

  let securityToken = tokenFrom(
    await request("/auth/login", {
      body: { password: securityPassword, username: "security-owner" },
      method: "POST",
    }),
  );
  const securityMfaSetup = await request("/auth/mfa/setup", {
    body: { currentPassword: securityPassword },
    method: "POST",
    token: securityToken,
  });
  const securitySecret = stringFrom(securityMfaSetup, "secret");
  await request("/auth/mfa/enable", {
    body: { code: createTotp(securitySecret) },
    method: "POST",
    token: securityToken,
  });
  securityToken = tokenFrom(
    await request("/auth/login", {
      body: {
        mfaCode: createTotp(securitySecret),
        password: securityPassword,
        username: "security-owner",
      },
      method: "POST",
    }),
  );
  const resourceLabels = await authorizedRequest("/security/resource-labels", securityToken);
  assert.equal(resourceLabels.status, 200);
  assert.equal(
    (resourceLabels.body.data as JsonObject[]).find((item) => item.resource === "audit")?.label,
    "confidential",
  );

  const operatorCreate = await sensitiveRequest(systemToken, systemPassword, "/users", {
    body: {
      displayName: "审计管理员候选",
      email: "audit-admin@admin-x.example",
      password: auditPassword,
      privacyNoticeAccepted: true,
      role: "operator",
      status: "active",
      username: "audit-owner",
    },
    method: "POST",
  });
  const operatorId = stringFrom(operatorCreate, "id");
  const securityLevelUpdate = await sensitiveRequest(
    securityToken,
    securityPassword,
    `/users/${operatorId}/security-level`,
    { body: { securityLevel: "secret" }, method: "PATCH" },
  );
  assert.equal(securityLevelUpdate.status, 200);
  assert.equal((securityLevelUpdate.body.data as JsonObject).securityLevel, "secret");
  const auditRoleUpdate = await sensitiveRequest(
    securityToken,
    securityPassword,
    `/users/${operatorId}/role`,
    { body: { role: "audit-admin" }, method: "PATCH" },
  );
  assert.equal(auditRoleUpdate.status, 200);
  const systemCanResetPassword = await sensitiveRequest(
    systemToken,
    systemPassword,
    `/users/${operatorId}/password`,
    { body: { newPassword: auditPassword }, method: "PATCH" },
  );
  assert.equal(systemCanResetPassword.status, 200);
  const securityCannotResetPassword = await sensitiveRequest(
    securityToken,
    securityPassword,
    `/users/${operatorId}/password`,
    { body: { newPassword: auditPassword }, method: "PATCH" },
  );
  assert.equal(securityCannotResetPassword.status, 403);

  let auditToken = tokenFrom(
    await request("/auth/login", {
      body: { password: auditPassword, username: "audit-owner" },
      method: "POST",
    }),
  );
  const auditMfaSetup = await request("/auth/mfa/setup", {
    body: { currentPassword: auditPassword },
    method: "POST",
    token: auditToken,
  });
  const auditSecret = stringFrom(auditMfaSetup, "secret");
  await request("/auth/mfa/enable", {
    body: { code: createTotp(auditSecret) },
    method: "POST",
    token: auditToken,
  });
  auditToken = tokenFrom(
    await request("/auth/login", {
      body: { mfaCode: createTotp(auditSecret), password: auditPassword, username: "audit-owner" },
      method: "POST",
    }),
  );

  const policyBefore = await authorizedRequest("/security/policy", securityToken);
  const policy = policyBefore.body.data as JsonObject;
  const policyUpdate = await sensitiveRequest(securityToken, securityPassword, "/security/policy", {
    body: { ...policy, mfaRequiredForAdministrators: true, lockoutMinutes: 30 },
    method: "PATCH",
  });
  assert.equal(policyUpdate.status, 200);

  const privacyCreate = await sensitiveRequest(systemToken, systemPassword, "/users", {
    body: {
      displayName: "隐私权利用户",
      email: "privacy-owner@admin-x.example",
      password: operatorPassword,
      privacyNoticeAccepted: true,
      role: "operator",
      status: "active",
      username: "privacy-owner",
    },
    method: "POST",
  });
  assert.ok(privacyCreate.status === 200 || privacyCreate.status === 201);

  const duplicate = await sensitiveRequest(systemToken, systemPassword, "/users", {
    body: {
      displayName: "重复账号",
      email: "duplicate@admin-x.example",
      password: operatorPassword,
      privacyNoticeAccepted: true,
      role: "operator",
      status: "active",
      username: "audit-owner",
    },
    method: "POST",
  });
  assert.equal(duplicate.status, 409);

  const weakPassword = await sensitiveRequest(systemToken, systemPassword, "/users", {
    body: {
      displayName: "弱密码账号",
      email: "weak@admin-x.example",
      password: "password123",
      privacyNoticeAccepted: true,
      role: "operator",
      status: "active",
      username: "weak-owner",
    },
    method: "POST",
  });
  assert.equal(weakPassword.status, 400);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failedLogin = await request("/auth/login", {
      body: { password: "WrongPassword123!", username: "audit-owner" },
      method: "POST",
    });
    assert.ok(failedLogin.status === 401 || failedLogin.status === 429);
  }
  const blockedLogin = await request("/auth/login", {
    body: { password: auditPassword, username: "audit-owner" },
    method: "POST",
  });
  assert.equal(blockedLogin.status, 429);
  const unlocked = await sensitiveRequest(
    systemToken,
    systemPassword,
    `/users/${operatorId}/unlock`,
    {
      method: "PATCH",
    },
  );
  assert.equal(unlocked.status, 200);

  auditToken = tokenFrom(
    await request("/auth/login", {
      body: {
        mfaCode: createTotp(auditSecret),
        password: auditPassword,
        username: "audit-owner",
      },
      method: "POST",
    }),
  );

  const auditCannotManageSecurity = await authorizedRequest("/security/policy", auditToken);
  assert.equal(auditCannotManageSecurity.status, 403);
  const systemCannotManageSecurity = await authorizedRequest("/security/policy", systemToken);
  assert.equal(systemCannotManageSecurity.status, 403);
  const publicMfaConfig = await request("/auth/mfa/config");
  assert.equal(publicMfaConfig.status, 200);
  assert.equal((publicMfaConfig.body.data as JsonObject).emailEnabled, false);
  const systemEmailSettings = await authorizedRequest("/security/email-mfa", systemToken);
  assert.equal(systemEmailSettings.status, 200);
  assert.equal((systemEmailSettings.body.data as JsonObject).enabled, false);
  const securityCannotManageEmailTransport = await authorizedRequest(
    "/security/email-mfa",
    securityToken,
  );
  assert.equal(securityCannotManageEmailTransport.status, 403);
  const securityEmailPolicy = await authorizedRequest("/security/email-mfa/policy", securityToken);
  assert.equal(securityEmailPolicy.status, 200);
  assert.equal((securityEmailPolicy.body.data as JsonObject).enabled, false);
  const systemCannotManageEmailPolicy = await authorizedRequest(
    "/security/email-mfa/policy",
    systemToken,
  );
  assert.equal(systemCannotManageEmailPolicy.status, 403);
  assert.equal((await authorizedRequest("/audit", auditToken)).status, 200);

  const localBackup = await sensitiveRequest(systemToken, systemPassword, "/compliance/backups", {
    body: { target: "local" },
    method: "POST",
  });
  assert.equal(localBackup.status, 201);
  const remoteBackup = await sensitiveRequest(systemToken, systemPassword, "/compliance/backups", {
    body: { target: "remote" },
    method: "POST",
  });
  assert.equal(remoteBackup.status, 201);
  assert.equal((localBackup.body.data as JsonObject).encrypted, true);
  assert.match(String((localBackup.body.data as JsonObject).checksum), /^[a-f0-9]{64}$/u);
  const localVerification = await sensitiveRequest(
    systemToken,
    systemPassword,
    `/compliance/backups/${stringFrom(localBackup, "id")}/verify`,
    { method: "POST" },
  );
  const remoteVerification = await sensitiveRequest(
    systemToken,
    systemPassword,
    `/compliance/backups/${stringFrom(remoteBackup, "id")}/verify`,
    { method: "POST" },
  );
  assert.equal(localVerification.status, 201);
  assert.equal(remoteVerification.status, 201);
  assert.equal((localVerification.body.data as JsonObject).valid, true);

  const scan = await sensitiveRequest(
    securityToken,
    securityPassword,
    "/compliance/vulnerability-scans",
    {
      body: {
        criticalCount: 0,
        highCount: 0,
        lowCount: 1,
        mediumCount: 0,
        report: "e2e dependency audit: no critical or high vulnerabilities",
        scanner: "e2e-dependency-audit",
      },
      method: "POST",
    },
  );
  assert.equal(scan.status, 201);
  assert.equal((scan.body.data as JsonObject).status, "passed");

  const maliciousAvatar = await request("/users/me", {
    body: {
      displayName: "系统管理员",
      email: "system-admin@admin-x.example",
      avatar: "data:image/png;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    },
    method: "PATCH",
    token: systemToken,
  });
  assert.equal(maliciousAvatar.status, 400);

  const exportData = await authorizedRequest(
    "/users/me/privacy/export",
    (await loginOperator()).token,
  );
  assert.equal(exportData.status, 200);
  const exportedUser = exportData.body.data as JsonObject;
  assert.equal((exportedUser.user as JsonObject).username, "privacy-owner");
  assert.equal("password" in exportedUser.user, false);

  const operatorSession = await loginOperator();
  const erase = await sensitiveRequest(
    operatorSession.token,
    operatorPassword,
    "/users/me/privacy/erase",
    { body: { currentPassword: operatorPassword }, method: "POST" },
  );
  assert.equal(erase.status, 201);
  assert.equal((await authorizedRequest("/auth/me", operatorSession.token)).status, 401);

  const privacyAudit = await authorizedRequest("/audit?keyword=privacy.export", auditToken);
  assert.equal(privacyAudit.status, 200);
  assert.ok(Number((privacyAudit.body.data as JsonObject).meta?.total ?? 0) > 0);

  const logout = await request("/auth/logout", { method: "POST", token: systemToken });
  assert.equal(logout.status, 201);
  assert.equal((await authorizedRequest("/auth/me", systemToken)).status, 401);

  const requestAudit = await authorizedRequest("/audit?keyword=api.request", auditToken);
  assert.equal(requestAudit.status, 200);
  assert.ok(Number((requestAudit.body.data as JsonObject).meta?.total ?? 0) > 0);
  const tokenFailureAudit = await authorizedRequest(
    "/audit?keyword=auth.token.failure",
    auditToken,
  );
  assert.equal(tokenFailureAudit.status, 200);
  assert.ok(Number((tokenFailureAudit.body.data as JsonObject).meta?.total ?? 0) > 0);
  const invalidAuditQuery = await authorizedRequest("/audit?page=not-a-number", auditToken);
  assert.equal(invalidAuditQuery.status, 400);

  const finalOverview = await authorizedRequest("/compliance/overview", securityToken);
  assert.equal(finalOverview.status, 200);
  const overview = finalOverview.body.data as JsonObject;
  assert.equal(overview.total, 18);
  assert.equal(overview.passed, 18, JSON.stringify(overview));
  assert.equal(overview.overallStatus, "pass");
});

async function loginOperator() {
  const response = await request("/auth/login", {
    body: { password: operatorPassword, username: "privacy-owner" },
    method: "POST",
  });
  return { response, token: tokenFrom(response) };
}

async function sensitiveRequest(
  token: string,
  password: string,
  path: string,
  options: RequestOptions = {},
) {
  const reauth = await request("/auth/reauth", {
    body: { currentPassword: password },
    method: "POST",
    token,
  });
  assert.equal(reauth.status, 201, JSON.stringify(reauth.body));
  return request(path, { ...options, reauth: stringFrom(reauth, "token"), token });
}

async function authorizedRequest(path: string, token: string) {
  return request(path, { token });
}

interface RequestOptions {
  body?: JsonObject;
  method?: string;
  origin?: string;
  reauth?: string;
  secure?: boolean;
  sign?: boolean;
  token?: string;
}

async function request(path: string, options: RequestOptions = {}): Promise<ApiResult> {
  const headers = new Headers({
    Accept: "application/json",
    Origin: options.origin ?? appOrigin,
    "User-Agent": "admin-x-security-checklist-e2e",
    "X-Request-Id": randomUUID(),
  });
  if (options.secure !== false) headers.set("X-Forwarded-Proto", "https");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.reauth) headers.set("X-Admin-X-Reauth", options.reauth);
  if (options.body) headers.set("Content-Type", "application/json");
  const method = (options.method ?? "GET").toUpperCase();
  const bodyText = options.body ? JSON.stringify(options.body) : "";
  if (
    options.sign !== false &&
    options.token &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(method)
  ) {
    const timestamp = String(Date.now());
    const nonce = randomUUID().replace(/-/g, "");
    const canonical = [method, path.split("?", 1)[0] || "/", timestamp, nonce, bodyText].join("\n");
    headers.set("X-Admin-X-Timestamp", timestamp);
    headers.set("X-Admin-X-Nonce", nonce);
    headers.set(
      "X-Admin-X-Signature",
      createHmac("sha256", options.token).update(canonical, "utf8").digest("hex"),
    );
  }
  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body ? bodyText : undefined,
    headers,
    method,
  });
  const text = await response.text();
  let body: JsonObject = {};
  if (text) {
    try {
      body = JSON.parse(text) as JsonObject;
    } catch {
      body = { raw: text };
    }
  }
  return { body, headers: response.headers, status: response.status };
}

async function waitForServer() {
  let lastError = "";
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await request("/health");
      if (response.status === 200) return;
      lastError = JSON.stringify(response.body);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`API e2e server did not start: ${lastError}`);
}

function tokenFrom(result: ApiResult): string {
  assert.ok(result.status === 200 || result.status === 201, JSON.stringify(result.body));
  return stringFrom(result, "token");
}

function stringFrom(result: ApiResult, key: string): string {
  const data = result.body.data as JsonObject | undefined;
  assert.equal(typeof data?.[key], "string", JSON.stringify(result.body));
  return String(data?.[key]);
}

function createTotp(secret: string, timestamp = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let bits = 0;
  let bitCount = 0;
  for (const character of secret) {
    bits = (bits << 5) | alphabet.indexOf(character);
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >> bitCount) & 0xff);
    }
  }
  const counter = BigInt(Math.floor(timestamp / 1000 / 30));
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}
