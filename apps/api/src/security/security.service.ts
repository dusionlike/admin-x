import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  AuthUser,
  EmailMfaPolicyStatus,
  EmailMfaSettings,
  IntegrityInspection,
  ResourceSecurityLabel,
  SecurityPolicy,
  SecurityLevel,
  UpdateEmailMfaTransportSettings,
} from "@admin-x/shared";

import { EmailMfaService } from "../auth/email-mfa.service.js";
import type { AuditContext } from "../database/database.service.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class SecurityService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EmailMfaService) private readonly emailMfaService: EmailMfaService,
  ) {}

  getPolicy(): SecurityPolicy {
    return this.database.getSecurityPolicy();
  }

  updatePolicy(policy: SecurityPolicy, actor: AuthUser, context?: AuditContext): SecurityPolicy {
    const normalized: SecurityPolicy = {
      ...policy,
      allowedIpRanges: Array.from(
        new Set(policy.allowedIpRanges.map((value) => value.trim()).filter(Boolean)),
      ),
    };
    if (normalized.allowedIpRanges.some((value) => value !== "*" && !isIpOrCidr(value))) {
      throw new BadRequestException("允许来源 IP 只能填写 IPv4、IPv4 网段或 *");
    }
    if (normalized.mfaRequiredForAdministrators) {
      const row = this.database.connection
        .prepare(
          `SELECT COUNT(*) AS count FROM users
           WHERE status = 'active'
             AND role NOT IN ('operator', 'readonly')
             AND (
               email = '' OR NOT EXISTS (
                 SELECT 1 FROM email_mfa_config WHERE id = 1 AND enabled = 1
               )
             )`,
        )
        .get() as { count?: number | bigint } | undefined;
      if (Number(row?.count ?? 0) > 0) {
        throw new BadRequestException(
          "启用管理员邮箱验证强制策略前，请先由系统管理员配置并启用邮箱验证，并确保所有有效管理员都已填写邮箱地址",
        );
      }
    }

    const before = this.database.getSecurityPolicy();
    this.database.updateSecurityPolicy(normalized);
    this.database.addActivity({
      action: "security-policy.update",
      actor: {
        displayName: actor.displayName,
        id: actor.id,
        role: actor.role,
        username: actor.username,
      },
      after: normalized,
      before,
      context,
      description: `${actor.displayName}（@${actor.username}）更新了登录与访问控制策略`,
      title: "更新安全策略",
      type: "update",
      resource: "security-policy",
    });
    return normalized;
  }

  getEmailMfaSettings(): EmailMfaSettings {
    return this.emailMfaService.getSettings();
  }

  updateEmailMfaTransport(
    input: UpdateEmailMfaTransportSettings,
    actor: AuthUser,
    context?: AuditContext,
  ): Promise<EmailMfaSettings> {
    return this.emailMfaService.updateTransportSettings(input, actor, context);
  }

  getEmailMfaPolicy(): EmailMfaPolicyStatus {
    return this.emailMfaService.getPolicyStatus();
  }

  updateEmailMfaPolicy(
    enabled: boolean,
    actor: AuthUser,
    context?: AuditContext,
  ): Promise<EmailMfaPolicyStatus> {
    return this.emailMfaService.setEnabled(enabled, actor, context);
  }

  testEmailMfa(actor: AuthUser, context?: AuditContext): Promise<{ maskedEmail: string }> {
    return this.emailMfaService.testDelivery(actor, context);
  }

  listResourceSecurityLabels(): ResourceSecurityLabel[] {
    return this.database.listResourceSecurityLabels();
  }

  inspectIntegrity(): IntegrityInspection {
    return this.database.inspectIntegrity();
  }

  updateResourceSecurityLabel(
    resource: string,
    label: SecurityLevel,
    actor: AuthUser,
    context?: AuditContext,
  ): ResourceSecurityLabel {
    const before = this.database
      .listResourceSecurityLabels()
      .find((item) => item.resource === resource);
    if (!before) {
      throw new NotFoundException("资源安全标记不存在");
    }
    if (!["public", "internal", "secret", "confidential"].includes(label)) {
      throw new BadRequestException("资源安全标记不合法");
    }
    const updated = this.database.updateResourceSecurityLabel(resource, label);
    this.database.addActivity({
      action: "resource-security-label.update",
      actor: {
        displayName: actor.displayName,
        id: actor.id,
        role: actor.role,
        username: actor.username,
      },
      after: updated,
      before,
      context,
      description: `${actor.displayName}（@${actor.username}）将资源 ${resource} 的安全标记调整为「${label}」`,
      title: "调整资源安全标记",
      type: "update",
      resource: "security-label",
      targetId: resource,
    });
    return updated;
  }
}

function isIpOrCidr(value: string): boolean {
  const [address, prefix] = value.split("/");
  const parts = address?.split(".") ?? [];
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return false;
  }
  if (parts.map(Number).some((part) => part < 0 || part > 255)) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  return /^\d+$/.test(prefix) && Number(prefix) >= 0 && Number(prefix) <= 32;
}
