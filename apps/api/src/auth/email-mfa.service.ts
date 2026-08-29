import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import type {
  AuthUser,
  EmailMfaCodeResponse,
  EmailMfaPolicyStatus,
  EmailMfaSettings,
  UpdateEmailMfaTransportSettings,
} from "@admin-x/shared";

import type { AuditContext, StoredEmailMfaConfig } from "../database/database.service.js";
import { DatabaseService } from "../database/database.service.js";

export interface EmailTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

export interface EmailTransport {
  verify(): Promise<unknown>;
  sendMail(options: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

export type EmailTransportFactory = (config: EmailTransportConfig) => EmailTransport;

export const EMAIL_TRANSPORT_FACTORY = Symbol("ADMIN_X_EMAIL_TRANSPORT_FACTORY");

const EMAIL_CODE_EXPIRES_SECONDS = 5 * 60;
const EMAIL_CODE_REQUEST_INTERVAL_MS = 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

@Injectable()
export class EmailMfaService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EMAIL_TRANSPORT_FACTORY) private readonly transportFactory: EmailTransportFactory,
  ) {}

  getPublicConfig(): { emailEnabled: boolean } {
    return { emailEnabled: this.database.getEmailMfaConfig().enabled };
  }

  getSettings(): EmailMfaSettings {
    const config = this.database.getEmailMfaConfig();
    const password = decryptSmtpPassword(config.smtpPasswordEncrypted);
    return {
      configured: isTransportConfigured(config, password),
      enabled: config.enabled,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      smtpHost: config.smtpHost,
      smtpPasswordSet: Boolean(password),
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUser: config.smtpUser,
      updatedAt: config.updatedAt,
    };
  }

  getPolicyStatus(): EmailMfaPolicyStatus {
    const config = this.database.getEmailMfaConfig();
    return {
      configured: isTransportConfigured(config, decryptSmtpPassword(config.smtpPasswordEncrypted)),
      enabled: config.enabled,
    };
  }

  async updateTransportSettings(
    input: UpdateEmailMfaTransportSettings,
    actor: AuthUser,
    context?: AuditContext,
  ): Promise<EmailMfaSettings> {
    const before = this.database.getEmailMfaConfig();
    const previousPassword = decryptSmtpPassword(before.smtpPasswordEncrypted);
    const password = input.smtpPassword === undefined ? previousPassword : input.smtpPassword;
    const normalized = normalizeTransportSettings(input, password);
    const next: StoredEmailMfaConfig = {
      ...before,
      ...normalized,
      smtpPasswordEncrypted: encryptSmtpPassword(password),
    };

    if (before.enabled) {
      await this.verifyTransport(next, "当前已启用的邮箱验证服务不可用，请修正配置后重试");
    }

    this.database.updateEmailMfaConfig(next);
    const after = this.toSettings(next);
    this.database.addActivity({
      action: "email-mfa.transport.update",
      actor: toAuditActor(actor),
      after,
      before: this.toSettings(before),
      context,
      description: `${actor.displayName}（@${actor.username}）更新了邮箱验证发信服务配置`,
      title: "更新邮箱验证发信配置",
      type: "update",
      resource: "email-mfa",
      targetId: actor.id,
    });
    return after;
  }

  async setEnabled(
    enabled: boolean,
    actor: AuthUser,
    context?: AuditContext,
  ): Promise<EmailMfaPolicyStatus> {
    const before = this.getPolicyStatus();
    const config = this.database.getEmailMfaConfig();
    if (enabled) {
      const password = decryptSmtpPassword(config.smtpPasswordEncrypted);
      if (!isTransportConfigured(config, password)) {
        throw new BadRequestException("请先由系统管理员完成邮箱服务配置并测试发信");
      }
      try {
        await this.verifyTransport(config, "邮箱验证发信服务连接失败，暂时不能启用");
      } catch (error: unknown) {
        this.recordFailure(
          actor,
          context,
          "email-mfa.policy.update",
          "启用邮箱验证前的发信服务检查失败",
        );
        throw error;
      }
    }

    this.database.setEmailMfaEnabled(enabled);
    const after = this.getPolicyStatus();
    this.database.addActivity({
      action: "email-mfa.policy.update",
      actor: toAuditActor(actor),
      after,
      before,
      context,
      description: `${actor.displayName}（@${actor.username}）${enabled ? "启用" : "停用"}了邮箱验证登录策略`,
      title: `${enabled ? "启用" : "停用"}邮箱验证登录策略`,
      type: "update",
      resource: "email-mfa",
      targetId: actor.id,
    });
    return after;
  }

  async testDelivery(actor: AuthUser, context?: AuditContext): Promise<{ maskedEmail: string }> {
    const config = this.database.getEmailMfaConfig();
    const password = decryptSmtpPassword(config.smtpPasswordEncrypted);
    if (!actor.email) {
      throw new BadRequestException("当前管理员未配置邮箱地址，无法接收测试邮件");
    }
    if (!isTransportConfigured(config, password)) {
      throw new BadRequestException("请先完成 SMTP 主机、发件地址和认证信息配置");
    }

    try {
      const transport = await this.verifyTransport(config, "邮箱服务连接失败，请检查 SMTP 配置");
      await transport.sendMail({
        from: formatFrom(config),
        subject: "[Admin X] 邮箱验证发信测试",
        text: `Admin X 邮箱验证发信测试成功。\n\n测试时间：${new Date().toLocaleString("zh-CN")}`,
        to: actor.email,
      });
    } catch (error: unknown) {
      this.recordFailure(actor, context, "email-mfa.delivery-test", "邮箱验证测试邮件发送失败");
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new ServiceUnavailableException("测试邮件发送失败，请检查 SMTP 配置和网络连通性");
    }

    this.database.addActivity({
      action: "email-mfa.delivery-test",
      actor: toAuditActor(actor),
      after: { maskedEmail: maskEmail(actor.email) },
      context,
      description: `${actor.displayName}（@${actor.username}）发送了邮箱验证测试邮件`,
      title: "测试邮箱验证发信",
      type: "system",
      resource: "email-mfa",
      targetId: actor.id,
    });
    return { maskedEmail: maskEmail(actor.email) };
  }

  async issueCode(user: AuthUser, context?: AuditContext): Promise<EmailMfaCodeResponse> {
    const config = this.database.getEmailMfaConfig();
    const password = decryptSmtpPassword(config.smtpPasswordEncrypted);
    if (!config.enabled || !isTransportConfigured(config, password)) {
      throw new BadRequestException("邮箱验证当前未启用");
    }
    if (!user.email) {
      throw new BadRequestException("当前账号未配置邮箱地址，无法发送验证码");
    }

    const previous = this.database.getLatestEmailMfaChallenge(user.id, true);
    if (
      previous &&
      Date.now() - new Date(previous.createdAt).getTime() < EMAIL_CODE_REQUEST_INTERVAL_MS
    ) {
      throw new BadRequestException("验证码发送过于频繁，请稍后再试");
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const challengeId = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + EMAIL_CODE_EXPIRES_SECONDS * 1000).toISOString();
    this.database.createEmailMfaChallenge({
      codeHash: hashCode(challengeId, code),
      createdAt,
      expiresAt,
      id: challengeId,
      requestIp: context?.ipAddress,
      userId: user.id,
    });

    try {
      const transport = this.transportFactory(toTransportConfig(config, password));
      await transport.sendMail({
        from: formatFrom(config),
        subject: "[Admin X] 登录验证码",
        text: `您好，您的 Admin X 登录验证码是：${code}\n\n验证码 5 分钟内有效。如非本人操作，请忽略此邮件。`,
        to: user.email,
      });
    } catch {
      this.database.consumeEmailMfaChallenge(challengeId);
      this.recordFailure(user, context, "auth.email-mfa.sent", "邮箱验证码发送失败");
      throw new ServiceUnavailableException("邮箱验证码发送失败，请稍后重试");
    }

    this.database.addActivity({
      action: "auth.email-mfa.sent",
      actor: toAuditActor(user),
      after: { maskedEmail: maskEmail(user.email), expiresIn: EMAIL_CODE_EXPIRES_SECONDS },
      context,
      description: `已向 ${maskEmail(user.email)} 发送邮箱验证码`,
      title: "发送邮箱验证码",
      type: "login",
      resource: "auth",
      targetId: user.id,
    });
    return {
      expiresIn: EMAIL_CODE_EXPIRES_SECONDS,
      maskedEmail: maskEmail(user.email),
    };
  }

  verifyCode(userId: string, code: string): boolean {
    const challenge = this.database.getLatestEmailMfaChallenge(userId);
    if (!challenge) {
      return false;
    }
    if (challenge.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      this.database.consumeEmailMfaChallenge(challenge.id);
      return false;
    }
    if (Date.now() >= new Date(challenge.expiresAt).getTime()) {
      this.database.consumeEmailMfaChallenge(challenge.id);
      return false;
    }

    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(hashCode(challenge.id, code.trim()), "hex");
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!valid) {
      this.database.incrementEmailMfaChallengeAttempts(challenge.id);
      if (challenge.attempts + 1 >= EMAIL_CODE_MAX_ATTEMPTS) {
        this.database.consumeEmailMfaChallenge(challenge.id);
      }
      return false;
    }

    this.database.consumeEmailMfaChallenge(challenge.id);
    return true;
  }

  private async verifyTransport(
    config: StoredEmailMfaConfig,
    message: string,
  ): Promise<EmailTransport> {
    const password = decryptSmtpPassword(config.smtpPasswordEncrypted);
    try {
      const transport = this.transportFactory(toTransportConfig(config, password));
      await transport.verify();
      return transport;
    } catch {
      throw new ServiceUnavailableException(message);
    }
  }

  private toSettings(config: StoredEmailMfaConfig): EmailMfaSettings {
    const password = decryptSmtpPassword(config.smtpPasswordEncrypted);
    return {
      configured: isTransportConfigured(config, password),
      enabled: config.enabled,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      smtpHost: config.smtpHost,
      smtpPasswordSet: Boolean(password),
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUser: config.smtpUser,
      updatedAt: config.updatedAt,
    };
  }

  private recordFailure(
    actor: AuthUser,
    context: AuditContext | undefined,
    action: string,
    description: string,
  ): void {
    this.database.addActivity({
      action,
      actor: toAuditActor(actor),
      context,
      description: `${actor.displayName}（@${actor.username}）${description}`,
      result: "failure",
      title: description,
      type: "system",
      resource: "email-mfa",
      targetId: actor.id,
    });
  }
}

function normalizeTransportSettings(
  input: UpdateEmailMfaTransportSettings,
  password: string,
): Omit<StoredEmailMfaConfig, "enabled" | "smtpPasswordEncrypted" | "updatedAt"> {
  const smtpHost = input.smtpHost.trim();
  const smtpUser = input.smtpUser.trim();
  const fromEmail = input.fromEmail.trim();
  const fromName = input.fromName.trim();
  if (!smtpHost) {
    throw new BadRequestException("SMTP 主机不能为空");
  }
  if (/[\r\n]/u.test(smtpHost) || /[\r\n]/u.test(smtpUser)) {
    throw new BadRequestException("SMTP 配置不能包含换行");
  }
  if (!Number.isInteger(input.smtpPort) || input.smtpPort < 1 || input.smtpPort > 65_535) {
    throw new BadRequestException("SMTP 端口必须是 1 到 65535 之间的整数");
  }
  if (!isValidEmail(fromEmail)) {
    throw new BadRequestException("发件邮箱地址无效");
  }
  if (!fromName || /[\r\n]/u.test(fromName)) {
    throw new BadRequestException("发件人名称不能为空且不能包含换行");
  }
  if (smtpUser && !password) {
    throw new BadRequestException("配置 SMTP 用户名后必须同时填写 SMTP 密码");
  }
  return {
    fromEmail,
    fromName,
    smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    smtpUser,
  };
}

function isTransportConfigured(config: StoredEmailMfaConfig, password: string): boolean {
  return Boolean(
    config.smtpHost.trim() &&
    config.smtpPort >= 1 &&
    config.smtpPort <= 65_535 &&
    isValidEmail(config.fromEmail) &&
    config.fromName.trim() &&
    (!config.smtpUser.trim() || password),
  );
}

function toTransportConfig(config: StoredEmailMfaConfig, password: string): EmailTransportConfig {
  return {
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    host: config.smtpHost,
    password,
    port: config.smtpPort,
    secure: config.smtpSecure,
    user: config.smtpUser,
  };
}

function formatFrom(config: StoredEmailMfaConfig): string {
  return `${config.fromName} <${config.fromEmail}>`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value) && !/[\r\n]/u.test(value);
}

function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  if (local.length <= 2) {
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`;
}

function hashCode(challengeId: string, code: string): string {
  return createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
}

function getSmtpEncryptionKey(): Buffer {
  const source =
    process.env.EMAIL_SMTP_ENCRYPTION_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    "admin-x-development-secret";
  return createHash("sha256").update(source).digest();
}

function encryptSmtpPassword(password: string): string {
  if (!password) {
    return "";
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSmtpEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decryptSmtpPassword(value: string): string {
  if (!value || !value.startsWith("v1:")) {
    return "";
  }
  const [, ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    return "";
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getSmtpEncryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function toAuditActor(actor: AuthUser): Pick<AuthUser, "id" | "displayName" | "role" | "username"> {
  return {
    displayName: actor.displayName,
    id: actor.id,
    role: actor.role,
    username: actor.username,
  };
}
