export const API_PREFIX = "/api" as const;
export const DEFAULT_PAGE_SIZE = 10 as const;

export type UserRole =
  | "system-admin"
  | "security-admin"
  | "audit-admin"
  | "business-admin"
  | "operator"
  | "readonly";
export type MfaMethod = "totp" | "email";
export type UserStatus = "active" | "invited" | "suspended";
export type DataScopeType = "all" | "organization" | "department" | "project" | "assigned" | "self";
export type SecurityLevel = "public" | "internal" | "secret" | "confidential";

export const SECURITY_LEVELS: readonly SecurityLevel[] = [
  "public",
  "internal",
  "secret",
  "confidential",
] as const;

export function securityLevelRank(level: SecurityLevel): number {
  return SECURITY_LEVELS.indexOf(level);
}

export function meetsSecurityLevel(subject: SecurityLevel, required: SecurityLevel): boolean {
  return securityLevelRank(subject) >= securityLevelRank(required);
}

export function defaultSecurityLevelForRole(role: UserRole): SecurityLevel {
  if (role === "system-admin" || role === "security-admin" || role === "audit-admin") {
    return "confidential";
  }
  if (role === "business-admin") {
    return "secret";
  }
  return "internal";
}

export interface DataScope {
  type: DataScopeType;
  ids: string[];
}

export interface DataAccessRecord {
  id: string;
  ownerId?: string;
  organizationId?: string;
  departmentId?: string;
  projectId?: string;
}

export function canAccessData(
  scope: DataScope,
  actorId: string,
  record: DataAccessRecord,
): boolean {
  switch (scope.type) {
    case "all":
      return true;
    case "self":
      return record.ownerId === actorId;
    case "organization":
      return Boolean(record.organizationId && scope.ids.includes(record.organizationId));
    case "department":
      return Boolean(record.departmentId && scope.ids.includes(record.departmentId));
    case "project":
      return Boolean(record.projectId && scope.ids.includes(record.projectId));
    case "assigned":
      return scope.ids.includes(record.id) || record.ownerId === actorId;
  }
}

export type Permission =
  | "dashboard:view"
  | "analytics:view"
  | "user:read"
  | "user:create"
  | "user:status"
  | "user:delete"
  | "role:assign"
  | "security:manage"
  | "audit:read"
  | "audit:export"
  | "business:read"
  | "business:operate"
  | "business:manage"
  | "system:manage"
  | "compliance:read"
  | "compliance:manage"
  | "backup:manage";

export interface RoleDefinition {
  code: UserRole;
  label: string;
  description: string;
  responsibilities: string;
  permissions: readonly Permission[];
  defaultDataScope: DataScopeType;
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    code: "system-admin",
    description: "负责系统资源、账号生命周期和运行保障，不负责安全策略审计。",
    label: "系统管理员",
    permissions: [
      "dashboard:view",
      "analytics:view",
      "user:read",
      "user:create",
      "user:status",
      "user:delete",
      "system:manage",
      "compliance:read",
      "backup:manage",
    ],
    responsibilities: "账号、组织、系统参数、运行维护、备份恢复",
    defaultDataScope: "all",
  },
  {
    code: "security-admin",
    description: "负责安全策略、授权审批和访问控制，不负责系统运行和审计记录管理。",
    label: "安全管理员",
    permissions: [
      "dashboard:view",
      "user:read",
      "role:assign",
      "security:manage",
      "compliance:read",
      "compliance:manage",
    ],
    responsibilities: "授权审批、口令策略、访问控制、安全参数",
    defaultDataScope: "all",
  },
  {
    code: "audit-admin",
    description: "负责审计记录的查询、分析和导出，不得修改业务数据或安全策略。",
    label: "审计管理员",
    permissions: ["dashboard:view", "audit:read", "audit:export", "compliance:read"],
    responsibilities: "审计查询、审计分析、审计报告、留痕检查",
    defaultDataScope: "all",
  },
  {
    code: "business-admin",
    description: "负责业务域配置和业务数据，不得管理账号、授权或审计记录。",
    label: "业务管理员",
    permissions: [
      "dashboard:view",
      "analytics:view",
      "business:read",
      "business:operate",
      "business:manage",
    ],
    responsibilities: "业务配置、业务数据、业务流程和业务报表",
    defaultDataScope: "all",
  },
  {
    code: "operator",
    description: "按业务需要使用系统，仅能访问被授权的业务功能。",
    label: "普通用户",
    permissions: ["dashboard:view", "analytics:view", "business:read", "business:operate"],
    responsibilities: "日常业务操作和个人资料维护",
    defaultDataScope: "assigned",
  },
  {
    code: "readonly",
    description: "仅查看授权范围内的业务数据和报表，不得执行增删改操作。",
    label: "查询/只读用户",
    permissions: ["dashboard:view", "analytics:view", "business:read"],
    responsibilities: "查询、统计、报表和只读核查",
    defaultDataScope: "assigned",
  },
] as const;

export const ADMINISTRATOR_ROLES: readonly UserRole[] = [
  "system-admin",
  "security-admin",
  "audit-admin",
  "business-admin",
] as const;

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (
    ROLE_DEFINITIONS.find((definition) => definition.code === role)?.permissions.includes(
      permission,
    ) ?? false
  );
}

export function getRoleDefinition(role: UserRole): RoleDefinition {
  return (
    ROLE_DEFINITIONS.find((definition) => definition.code === role) ??
    ROLE_DEFINITIONS[ROLE_DEFINITIONS.length - 1]
  );
}

export function isAdministratorRole(role: UserRole): boolean {
  return ADMINISTRATOR_ROLES.includes(role);
}

export const ACCOUNT_PASSWORD_MIN_LENGTH = 8 as const;
export const ADMIN_PASSWORD_MIN_LENGTH = 12 as const;
export const PASSWORD_EXPIRY_WARNING_DAYS = 14 as const;
export const PRIVACY_NOTICE_VERSION = "v1.0" as const;
export const PRIVACY_NOTICE_SUMMARY =
  "系统仅采集账号识别、岗位授权、账号通知和安全审计所必需的信息，并提供查询、导出、更正和注销权利。";

const COMMON_ACCOUNT_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "admin123",
  "admin123!",
  "password123",
  "qwerty123",
]);

function hasSequentialRun(value: string): boolean {
  const normalized = value.toLocaleLowerCase();
  let ascending = 1;
  let descending = 1;
  for (let index = 1; index < normalized.length; index += 1) {
    const difference = normalized.charCodeAt(index) - normalized.charCodeAt(index - 1);
    ascending = difference === 1 ? ascending + 1 : 1;
    descending = difference === -1 ? descending + 1 : 1;
    if (ascending >= 4 || descending >= 4) {
      return true;
    }
  }
  return false;
}

export function accountPasswordMinimumLength(role?: UserRole): number {
  return role && role !== "operator" && role !== "readonly"
    ? ADMIN_PASSWORD_MIN_LENGTH
    : ACCOUNT_PASSWORD_MIN_LENGTH;
}

export function getAccountPasswordPolicyError(
  password: string,
  options: { minimumLength?: number; role?: UserRole; username?: string } = {},
): string | null {
  const minimumLength = Math.max(
    accountPasswordMinimumLength(options.role),
    options.minimumLength ?? ACCOUNT_PASSWORD_MIN_LENGTH,
  );
  if (Array.from(password).length < minimumLength) {
    return `密码长度不能少于 ${minimumLength} 位`;
  }
  if (/\s/u.test(password)) {
    return "密码不能包含空格或换行";
  }

  const username = options.username?.trim().toLocaleLowerCase();
  if (username && password.toLocaleLowerCase().includes(username)) {
    return "密码不能包含登录用户名";
  }

  const normalized = password.toLocaleLowerCase();
  if (COMMON_ACCOUNT_PASSWORDS.has(normalized) || /(.)\1{3,}/u.test(password)) {
    return "密码过于简单，请避免使用常见口令或重复字符";
  }
  if (hasSequentialRun(password)) {
    return "密码过于简单，请避免使用连续字符";
  }

  const characterTypes = [/[a-z]/u, /[A-Z]/u, /\d/u, /[^\p{L}\p{N}\s]/u].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (characterTypes < 4) {
    return "密码必须同时包含数字、大写字母、小写字母和特殊字符";
  }

  return null;
}

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface PageResult<T> {
  items: T[];
  meta: PageMeta;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  securityLevel: SecurityLevel;
  dataScope: DataScope;
  mfaEnabled: boolean;
  privacyNoticeVersion?: string;
  email?: string;
  avatar?: string;
  remark?: string;
  lastLoginAt?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  mfaCode?: string;
  mfaMethod?: MfaMethod;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  expiresIn: number;
  passwordStatus?: PasswordStatus;
}

export interface AuthSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  current: boolean;
}

export interface ReauthenticationRequest {
  currentPassword: string;
}

export interface ReauthenticationResponse {
  token: string;
  expiresIn: number;
}

export interface SetupStatus {
  needsSetup: boolean;
}

export interface SetupAdminRequest {
  username: string;
  displayName: string;
  email: string;
  password: string;
  privacyNoticeAccepted: boolean;
}

export interface MetricItem {
  key: "users" | "visits" | "active" | "health";
  label: string;
  value: number;
  suffix?: string;
  trend: number;
  trendLabel: string;
  icon: string;
  color: string;
}

export interface TrendItem {
  label: string;
  value: number;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: "login" | "create" | "update" | "system";
}

export interface QuickAction {
  key: string;
  title: string;
  description: string;
  route: string;
  icon: string;
  color: string;
}

export interface DashboardOverview {
  metrics: MetricItem[];
  trend: TrendItem[];
  recentActivity: ActivityItem[];
  quickActions: QuickAction[];
}

export interface AnalyticsSummary {
  totalVisits: number;
  averageDailyVisits: number;
  peakDay: TrendItem;
  totalUsers: number;
  activeUsers: number;
}

export interface AnalyticsDistributionItem {
  key: string;
  label: string;
  value: number;
}

export interface AnalyticsOverview {
  summary: AnalyticsSummary;
  trend: TrendItem[];
  roleDistribution: AnalyticsDistributionItem[];
  statusDistribution: AnalyticsDistributionItem[];
}

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatar?: string;
  role: UserRole;
  securityLevel: SecurityLevel;
  status: UserStatus;
  dataScope: DataScope;
  mfaEnabled: boolean;
  remark?: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface UserListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: UserStatus | "all";
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  email: string;
  password: string;
  role: UserRole;
  status?: UserStatus;
  remark?: string;
  privacyNoticeAccepted: boolean;
}

export interface PrivacyEraseRequest {
  currentPassword: string;
}

export interface PrivacyConsentRequest {
  accepted: boolean;
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
}

export interface UpdateUserRoleRequest {
  role: UserRole;
}

export interface AuditRecord {
  id: string;
  actorId?: string;
  actorName: string;
  actorUsername?: string;
  actorRole?: UserRole;
  action: string;
  resource: string;
  targetId?: string;
  title: string;
  description: string;
  type: ActivityItem["type"];
  result: "success" | "failure" | "blocked";
  createdAt: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  before?: unknown;
  after?: unknown;
  integrityHash?: string;
}

export interface AuditListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  result?: AuditRecord["result"] | "all";
}

export interface UpdateUserDataScopeRequest {
  dataScope: DataScope;
}

export interface UpdateUserSecurityLevelRequest {
  securityLevel: SecurityLevel;
}

export interface ResourceSecurityLabel {
  resource: string;
  label: SecurityLevel;
  description: string;
  updatedAt: string;
}

export interface UpdateResourceSecurityLabelRequest {
  label: SecurityLevel;
}

export interface IntegrityInspection {
  checkedAt: string;
  resourceLabels: { checked: number; failed: number };
  users: { checked: number; failed: number };
  securityPolicy: { checked: number; failed: number };
}

export interface SecurityPolicy {
  passwordMinLength: number;
  passwordMaxAgeDays: number;
  loginFailureLimit: number;
  lockoutMinutes: number;
  sessionTimeoutMinutes: number;
  concurrentSessionLimit: number;
  mfaRequiredForAdministrators: boolean;
  sensitiveActionReauth: boolean;
  allowedIpRanges: string[];
}

export interface EmailMfaSettings {
  enabled: boolean;
  configured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordSet: boolean;
  fromEmail: string;
  fromName: string;
  updatedAt?: string;
}

export interface EmailMfaTransportSettings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordSet: boolean;
  fromEmail: string;
  fromName: string;
}

export interface UpdateEmailMfaTransportSettings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword?: string;
  fromEmail: string;
  fromName: string;
}

export interface EmailMfaPolicyStatus {
  enabled: boolean;
  configured: boolean;
}

export interface UpdateEmailMfaPolicy {
  enabled: boolean;
}

export interface EmailMfaCodeResponse {
  expiresIn: number;
  maskedEmail: string;
}

export interface MfaPublicConfig {
  emailEnabled: boolean;
}

export type ComplianceStatus = "pass" | "attention" | "fail";
export type BackupTarget = "local" | "remote";
export type BackupStatus = "running" | "success" | "failed";

export interface BackupRecord {
  id: string;
  target: BackupTarget;
  status: BackupStatus;
  path: string;
  checksum?: string;
  sizeBytes?: number;
  encrypted: boolean;
  createdAt: string;
  completedAt?: string;
  retentionUntil?: string;
  verifiedAt?: string;
  verificationStatus?: "verified" | "failed";
  error?: string;
}

export interface BackupVerification {
  backupId: string;
  checksum: string;
  tables: string[];
  valid: boolean;
  verifiedAt: string;
}

export interface VulnerabilityScanRecord {
  id: string;
  scanner: string;
  status: "passed" | "failed";
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  scannedAt: string;
  report?: string;
}

export interface ComplianceCheck {
  id: number;
  key: string;
  title: string;
  controlArea: string;
  requirement: string;
  status: ComplianceStatus;
  evidence: string;
  owner: string;
  automated: boolean;
  lastCheckedAt: string;
}

export interface ComplianceOverview {
  overallStatus: ComplianceStatus;
  score: number;
  passed: number;
  total: number;
  checks: ComplianceCheck[];
  capabilities: {
    secureTransportRequired: boolean;
    contentSecurityPolicy: boolean;
    inputValidation: boolean;
    malwareScanMode: string;
    passwordHashing: string;
    sensitiveDataEncryption: string;
    auditAppendOnly: boolean;
    auditRetentionMonths: number;
    backupEncryption: string;
    highAvailability: boolean;
  };
  latestBackups: BackupRecord[];
  latestVulnerabilityScan?: VulnerabilityScanRecord;
  privacy: {
    collectedFields: string[];
    classifications: PrivacyFieldClassification[];
    noticeVersion: string;
    purposes: string[];
    retentionDays: number;
    retentionCleanup: string;
    rights: string[];
  };
}

export interface PrivacyFieldClassification {
  field: string;
  category: string;
  purpose: string;
  required: boolean;
}

export interface PersonalDataExport {
  exportedAt: string;
  privacyNotice: {
    acceptedAt: string;
    summary: string;
    version: string;
  };
  user: Omit<AuthUser, "mfaEnabled"> & { mfaEnabled: boolean };
  auditRecords: AuditRecord[];
}

export interface MfaStatus {
  enabled: boolean;
  configured: boolean;
}

export interface MfaSetupResponse {
  secret: string;
  otpauthUrl: string;
}

export interface UpdateProfileRequest {
  displayName: string;
  email: string;
  remark?: string;
  avatar?: string;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangeExpiredPasswordRequest extends UpdatePasswordRequest {
  username: string;
}

export interface ResetUserPasswordRequest {
  newPassword: string;
}

export interface PasswordStatus {
  changedAt: string;
  expiresAt?: string;
  maxAgeDays: number;
  daysRemaining?: number;
  expiringSoon: boolean;
  expired: boolean;
}

export function createApiResponse<T>(data: T, message = "success"): ApiResponse<T> {
  return {
    code: 0,
    data,
    message,
  };
}

export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  if (response.code !== 0) {
    throw new Error(response.message);
  }
  return response.data;
}

export function createPageMeta(total: number, page: number, pageSize: number): PageMeta {
  const safePageSize = Math.max(1, pageSize);
  return {
    page,
    pageCount: Math.max(1, Math.ceil(total / safePageSize)),
    pageSize: safePageSize,
    total,
  };
}

export function normalizePageQuery(query: UserListQuery = {}) {
  const page = toPositiveInt(query.page, 1, 9999);
  const pageSize = toPositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, 100);

  return {
    keyword: query.keyword?.trim().toLowerCase() ?? "",
    page,
    pageSize,
    status: query.status ?? "all",
  };
}

export function toPositiveInt(
  value: unknown,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

export function getErrorMessage(error: unknown, fallback = "请求失败，请稍后重试"): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
