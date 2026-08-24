import type { PrivacyFieldClassification } from "@admin-x/shared";
import { PRIVACY_NOTICE_VERSION } from "@admin-x/shared";

export const DEFAULT_PERSONAL_DATA_RETENTION_DAYS = 365 as const;

export const PRIVACY_FIELD_CLASSIFICATIONS: readonly PrivacyFieldClassification[] = [
  {
    category: "身份标识",
    field: "登录用户名",
    purpose: "身份鉴别和账号管理",
    required: true,
  },
  {
    category: "基本信息",
    field: "显示名称",
    purpose: "账号展示和通知",
    required: true,
  },
  {
    category: "联系方式",
    field: "邮箱",
    purpose: "账号通知和邮箱 MFA",
    required: true,
  },
  {
    category: "职业/权限信息",
    field: "岗位角色和数据范围",
    purpose: "岗位授权和最小权限控制",
    required: true,
  },
  {
    category: "基本信息",
    field: "必要备注",
    purpose: "账号管理补充说明",
    required: false,
  },
  {
    category: "基本信息",
    field: "头像",
    purpose: "账号展示",
    required: false,
  },
  {
    category: "网络身份标识",
    field: "登录 IP",
    purpose: "安全审计和异常登录处置",
    required: false,
  },
] as const;

export function getPersonalDataRetentionDays(): number {
  const configured = Number(process.env.PERSONAL_DATA_RETENTION_DAYS);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_PERSONAL_DATA_RETENTION_DAYS;
}

export function maskPersonalEmail(value: string): string {
  const [localPart = "", domain = ""] = value.trim().split("@", 2);
  if (!localPart || !domain) {
    return "***";
  }
  const visible = localPart.length <= 2 ? localPart.slice(0, 1) : localPart.slice(0, 2);
  return `${visible}***@${domain}`;
}

export function currentPrivacyNoticeVersion(): string {
  return PRIVACY_NOTICE_VERSION;
}
