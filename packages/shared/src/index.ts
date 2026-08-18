export const API_PREFIX = "/api" as const;
export const DEFAULT_PAGE_SIZE = 10 as const;

export type UserRole = "super-admin" | "admin" | "operator";
export type UserStatus = "active" | "invited" | "suspended";

export const ACCOUNT_PASSWORD_MIN_LENGTH = 8 as const;
export const ADMIN_PASSWORD_MIN_LENGTH = 12 as const;

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
  return role === "admin" || role === "super-admin"
    ? ADMIN_PASSWORD_MIN_LENGTH
    : ACCOUNT_PASSWORD_MIN_LENGTH;
}

export function getAccountPasswordPolicyError(
  password: string,
  options: { role?: UserRole; username?: string } = {},
): string | null {
  const minimumLength = accountPasswordMinimumLength(options.role);
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
  if (characterTypes < 3) {
    return "密码至少包含数字、大小写字母、特殊字符中的三类";
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
  email?: string;
  avatar?: string;
  remark?: string;
  lastLoginAt?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
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

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatar?: string;
  role: UserRole;
  status: UserStatus;
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
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
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
