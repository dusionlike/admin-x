export const API_PREFIX = "/api" as const;
export const DEFAULT_PAGE_SIZE = 10 as const;

export type UserRole = "super-admin" | "admin" | "operator";
export type UserStatus = "active" | "invited" | "suspended";

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
  role: UserRole;
  status: UserStatus;
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
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
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
