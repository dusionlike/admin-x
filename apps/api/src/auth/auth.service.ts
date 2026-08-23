import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";

import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  MfaSetupResponse,
  MfaStatus,
  ReauthenticationResponse,
  SetupAdminRequest,
  SetupStatus,
} from "@admin-x/shared";

import { DatabaseService } from "../database/database.service.js";
import type { AuditContext } from "../database/database.service.js";
import { generateMfaSecret, createMfaOtpAuthUrl, verifyMfaCode } from "./mfa.js";
import { verifyPassword } from "./password.js";
import { issueReauthenticationToken, REAUTHENTICATION_EXPIRES_IN } from "./reauth.js";
import { UsersService } from "../users/users.service.js";
import type { LoginCredentials } from "../users/users.service.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "admin-x-development-secret";
const DEFAULT_SESSION_TIMEOUT_SECONDS = 30 * 60;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  getSetupStatus(): SetupStatus {
    return { needsSetup: this.usersService.count() === 0 };
  }

  setupAdmin(input: SetupAdminRequest, context?: AuditContext): LoginResponse {
    const user = this.usersService.createAdmin(input, context);
    const authenticated = this.usersService.findAuthenticatedUser(user.id);
    if (!authenticated) {
      throw new UnauthorizedException("初始化管理员失败，请重试");
    }
    this.usersService.markLogin(user.id, authenticated.user, context);
    return this.issueToken(authenticated.user, authenticated.sessionVersion);
  }

  login(input: LoginRequest, context?: AuditContext): LoginResponse {
    const username = input.username.trim();
    const policy = this.database.getSecurityPolicy();
    if (!isIpAllowed(context?.ipAddress, policy.allowedIpRanges)) {
      this.usersService.recordLoginFailure(username, "来源 IP 不在允许范围内", context);
      throw new UnauthorizedException("用户名或密码错误");
    }

    const credentials = this.usersService.findCredentials(username);
    if (!credentials) {
      this.usersService.recordLoginFailure(username, "账号不存在或密码错误", context);
      throw new UnauthorizedException("用户名或密码错误");
    }

    if (isLocked(credentials.lockedUntil)) {
      this.usersService.recordLoginFailure(
        username,
        "账号仍处于锁定期",
        context,
        credentials.lockedUntil ?? undefined,
      );
      throw new HttpException("账号已被临时锁定，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!verifyPassword(input.password, credentials.passwordHash)) {
      this.failLogin(
        credentials,
        "用户名或密码错误",
        context,
        policy.loginFailureLimit,
        policy.lockoutMinutes,
      );
    }

    if (
      credentials.user.mfaEnabled &&
      !verifyMfaCode(this.usersService.getMfaSecret(credentials.user.id), input.mfaCode ?? "")
    ) {
      this.failLogin(
        credentials,
        "MFA 验证码错误",
        context,
        policy.loginFailureLimit,
        policy.lockoutMinutes,
      );
    }

    if (isAdministrator(credentials.user.role) && policy.mfaRequiredForAdministrators) {
      if (!credentials.user.mfaEnabled) {
        this.usersService.recordLoginFailure(username, "管理员账号未绑定 MFA", context);
        throw new ForbiddenException("管理员账号必须先绑定 MFA 后才能登录");
      }
    }

    if (isPasswordExpired(credentials.passwordChangedAt, policy.passwordMaxAgeDays)) {
      this.usersService.recordLoginFailure(username, "密码已超过有效期", context);
      throw new ForbiddenException("密码已过期，请联系系统管理员重置");
    }

    const authenticatedUser = this.usersService.findAuthenticatedUser(credentials.user.id);
    if (!authenticatedUser || authenticatedUser.status !== "active") {
      this.usersService.recordLoginFailure(
        username,
        authenticatedUser?.status === "suspended" ? "账号已停用" : "账号尚未激活",
        context,
      );
      throw new UnauthorizedException(
        authenticatedUser?.status === "suspended" ? "账号已停用" : "账号尚未激活",
      );
    }

    this.usersService.markLogin(credentials.user.id, credentials.user, context);
    return this.issueToken(
      { ...credentials.user, lastLoginAt: new Date().toISOString() },
      authenticatedUser.sessionVersion,
    );
  }

  authenticate(token: string, context?: AuditContext): AuthUser {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (typeof payload === "string" || !payload.sub) {
        throw new Error("Invalid token payload");
      }
      const policy = this.database.getSecurityPolicy();
      if (!isIpAllowed(context?.ipAddress, policy.allowedIpRanges)) {
        throw new Error("IP address is not allowed");
      }

      const authenticatedUser = this.usersService.findAuthenticatedUser(String(payload.sub));
      if (!authenticatedUser || authenticatedUser.status !== "active") {
        throw new Error("Account not found or inactive");
      }
      if (
        typeof payload.sessionVersion !== "number" ||
        payload.sessionVersion !== authenticatedUser.sessionVersion
      ) {
        throw new Error("Session has been revoked");
      }
      if (
        typeof payload.jti !== "string" ||
        !this.database.isSessionActive(
          String(payload.sub),
          payload.jti,
          policy.sessionTimeoutMinutes * 60,
        )
      ) {
        throw new Error("Session is not active");
      }
      if (isLocked(authenticatedUser.lockedUntil)) {
        throw new Error("Account is locked");
      }
      if (
        policy.mfaRequiredForAdministrators &&
        isAdministrator(authenticatedUser.user.role) &&
        !authenticatedUser.user.mfaEnabled
      ) {
        throw new Error("MFA is required");
      }
      return authenticatedUser.user;
    } catch {
      throw new UnauthorizedException("登录状态已失效，请重新登录");
    }
  }

  logout(user: AuthUser, context?: AuditContext): null {
    this.usersService.invalidateSessions(user.id, user, context);
    return null;
  }

  reauthenticate(
    userId: string,
    currentPassword: string,
    context?: AuditContext,
  ): ReauthenticationResponse {
    const authenticated = this.usersService.findAuthenticatedUser(userId);
    if (!authenticated || authenticated.status !== "active") {
      throw new UnauthorizedException("登录状态已失效，请重新登录");
    }
    if (!this.usersService.verifyCurrentPassword(userId, currentPassword)) {
      this.database.addActivity({
        action: "auth.reauthenticate.failure",
        actor: {
          displayName: authenticated.user.displayName,
          id: authenticated.user.id,
          role: authenticated.user.role,
          username: authenticated.user.username,
        },
        context,
        description: `${authenticated.user.displayName}（@${authenticated.user.username}）敏感操作二次验证失败`,
        result: "failure",
        title: "敏感操作二次验证失败",
        type: "login",
        resource: "auth",
        targetId: userId,
      });
      throw new UnauthorizedException("当前密码不正确");
    }

    this.database.addActivity({
      action: "auth.reauthenticate.success",
      actor: {
        displayName: authenticated.user.displayName,
        id: authenticated.user.id,
        role: authenticated.user.role,
        username: authenticated.user.username,
      },
      context,
      description: `${authenticated.user.displayName}（@${authenticated.user.username}）通过敏感操作二次验证`,
      title: "通过敏感操作二次验证",
      type: "login",
      resource: "auth",
      targetId: userId,
    });
    return {
      expiresIn: REAUTHENTICATION_EXPIRES_IN,
      token: issueReauthenticationToken(authenticated.user, authenticated.sessionVersion),
    };
  }

  getMfaStatus(userId: string): MfaStatus {
    return this.usersService.getMfaStatus(userId);
  }

  setupMfa(userId: string, currentPassword: string, context?: AuditContext): MfaSetupResponse {
    if (!this.usersService.verifyCurrentPassword(userId, currentPassword)) {
      throw new UnauthorizedException("当前密码不正确");
    }
    const user = this.usersService.findAuthenticatedUser(userId)?.user;
    if (!user) {
      throw new UnauthorizedException("登录状态已失效，请重新登录");
    }
    const secret = generateMfaSecret();
    this.usersService.saveMfaSecret(userId, secret, context);
    return { otpauthUrl: createMfaOtpAuthUrl(secret, user.username), secret };
  }

  enableMfa(userId: string, code: string, context?: AuditContext): MfaStatus {
    const secret = this.usersService.getMfaSecret(userId);
    if (!secret || !verifyMfaCode(secret, code)) {
      throw new UnauthorizedException("MFA 验证码不正确");
    }
    this.usersService.setMfaEnabled(userId, true, context);
    return this.usersService.getMfaStatus(userId);
  }

  disableMfa(
    userId: string,
    currentPassword: string,
    code: string,
    context?: AuditContext,
  ): MfaStatus {
    if (!this.usersService.verifyCurrentPassword(userId, currentPassword)) {
      throw new UnauthorizedException("当前密码不正确");
    }
    const secret = this.usersService.getMfaSecret(userId);
    if (!secret || !verifyMfaCode(secret, code)) {
      throw new UnauthorizedException("MFA 验证码不正确");
    }
    this.usersService.setMfaEnabled(userId, false, context);
    this.usersService.saveMfaSecret(userId, "", context);
    return this.usersService.getMfaStatus(userId);
  }

  private failLogin(
    credentials: LoginCredentials,
    reason: string,
    context: AuditContext | undefined,
    failureLimit: number,
    lockoutMinutes: number,
  ): never {
    const nextCount = credentials.failedLoginCount + 1;
    const lockedUntil =
      nextCount >= failureLimit
        ? new Date(Date.now() + lockoutMinutes * 60_000).toISOString()
        : undefined;
    const result = this.usersService.recordLoginFailure(
      credentials.user.username,
      reason,
      context,
      lockedUntil,
    );
    if (result.lockedUntil) {
      throw new HttpException("登录失败次数过多，账号已被临时锁定", HttpStatus.TOO_MANY_REQUESTS);
    }
    throw new UnauthorizedException("用户名或密码错误");
  }

  private issueToken(user: AuthUser, sessionVersion: number): LoginResponse {
    const policy = this.database.getSecurityPolicy();
    const expiresIn = Math.max(
      5 * 60,
      policy.sessionTimeoutMinutes * 60 || DEFAULT_SESSION_TIMEOUT_SECONDS,
    );
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const token = jwt.sign(
      {
        role: user.role,
        sessionVersion,
        username: user.username,
      },
      JWT_SECRET,
      {
        expiresIn,
        jwtid: sessionId,
        subject: user.id,
      },
    );
    this.database.createSession(user.id, sessionId, expiresAt, policy.concurrentSessionLimit);

    return { expiresIn, token, user };
  }
}

function isAdministrator(role: AuthUser["role"]): boolean {
  return role !== "operator" && role !== "readonly";
}

function isLocked(value: string | null): boolean {
  return Boolean(value && Date.parse(value) > Date.now());
}

function isPasswordExpired(value: string, maxAgeDays: number): boolean {
  if (!value || maxAgeDays <= 0) {
    return false;
  }
  const changedAt = Date.parse(value);
  return Number.isFinite(changedAt) && Date.now() - changedAt > maxAgeDays * 86_400_000;
}

function isIpAllowed(ip: string | undefined, ranges: string[]): boolean {
  if (ranges.length === 0 || !ip) {
    return ranges.length === 0;
  }
  const normalizedIp = normalizeIp(ip);
  return ranges.some((range) => {
    const normalizedRange = normalizeIp(range.trim());
    if (!normalizedRange || normalizedRange === "*") {
      return normalizedRange === "*";
    }
    if (!normalizedRange.includes("/")) {
      return normalizedIp === normalizedRange;
    }
    const [network, prefixText] = normalizedRange.split("/");
    const prefix = Number(prefixText);
    const ipNumber = ipv4ToNumber(normalizedIp);
    const networkNumber = ipv4ToNumber(network ?? "");
    if (
      ipNumber === null ||
      networkNumber === null ||
      !Number.isInteger(prefix) ||
      prefix < 0 ||
      prefix > 32
    ) {
      return false;
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNumber & mask) === (networkNumber & mask);
  });
}

function normalizeIp(value: string): string {
  return value.trim().replace(/^::ffff:/i, "");
}

function ipv4ToNumber(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  const numbers = parts.map(Number);
  if (numbers.some((part) => part < 0 || part > 255)) {
    return null;
  }
  return ((numbers[0]! << 24) | (numbers[1]! << 16) | (numbers[2]! << 8) | numbers[3]!) >>> 0;
}
