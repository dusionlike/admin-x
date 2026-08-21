import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import type { AuthUser, SecurityPolicy } from "@admin-x/shared";

import type { AuditContext } from "../database/database.service.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class SecurityService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

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
             AND mfa_enabled = 0`,
        )
        .get() as { count?: number | bigint } | undefined;
      if (Number(row?.count ?? 0) > 0) {
        throw new BadRequestException("启用管理员 MFA 强制策略前，请先为所有管理员绑定 MFA");
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
