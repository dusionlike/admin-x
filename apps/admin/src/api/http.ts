import axios, { AxiosHeaders } from "axios";
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";

import type { ApiResponse } from "@admin-x/shared";
import { API_PREFIX, unwrapApiResponse } from "@admin-x/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || API_PREFIX;
const TOKEN_KEY = "admin-x:token";
const USER_KEY = "admin-x:user";
const LOGOUT_SYNC_KEY = "admin-x:logout-sync";
export const SESSION_EXPIRED_KEY = "admin-x:session-expired";
let reauthenticationToken = "";
let sessionExpiryRedirecting = false;

export function clearReauthenticationToken() {
  reauthenticationToken = "";
}

export function setReauthenticationToken(token: string) {
  reauthenticationToken = token;
}

export const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 12_000,
});

http.interceptors.request.use((config) => {
  return signStateChangingRequest(config);
});

async function signStateChangingRequest(config: InternalAxiosRequestConfig) {
  config.headers = AxiosHeaders.from(config.headers);
  const token = typeof window === "undefined" ? "" : sessionStorage.getItem("admin-x:token");
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  if (reauthenticationToken) {
    config.headers.set("X-Admin-X-Reauth", reauthenticationToken);
  }
  if (token && isStateChangingMethod(config.method)) {
    const timestamp = String(Date.now());
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const body = serializeBody(config.data);
    const path = requestPath(config);
    const canonical = [config.method?.toUpperCase(), path, timestamp, nonce, body].join("\n");
    const signature = await signHmac(token, canonical);
    config.headers.set("X-Admin-X-Timestamp", timestamp);
    config.headers.set("X-Admin-X-Nonce", nonce);
    config.headers.set("X-Admin-X-Signature", signature);
  }
  return config;
}

function isStateChangingMethod(method: string | undefined): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes((method ?? "GET").toUpperCase());
}

function serializeBody(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function requestPath(config: AxiosRequestConfig): string {
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const url = new URL(config.url ?? "/", new URL(config.baseURL ?? apiBaseUrl, origin));
  return url.pathname.replace(/^\/api(?=\/|$)/u, "") || "/";
}

async function signHmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        redirectAfterSessionExpiry();
      }
      const responseMessage = (error.response?.data as { message?: string | string[] } | undefined)
        ?.message;
      if (Array.isArray(responseMessage)) {
        return Promise.reject(new Error(responseMessage.join("、")));
      }
      if (typeof responseMessage === "string" && responseMessage.length > 0) {
        return Promise.reject(new Error(responseMessage));
      }
    }
    return Promise.reject(error);
  },
);

function redirectAfterSessionExpiry(): void {
  if (typeof window === "undefined" || sessionExpiryRedirecting) {
    return;
  }
  if (!sessionStorage.getItem(TOKEN_KEY)) {
    return;
  }

  sessionExpiryRedirecting = true;
  clearReauthenticationToken();
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
  localStorage.setItem(LOGOUT_SYNC_KEY, String(Date.now()));

  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const loginUrl = new URL("/login", window.location.origin);
  if (redirect !== "/login" && !redirect.startsWith("/login?")) {
    loginUrl.searchParams.set("redirect", redirect);
  }
  window.location.assign(loginUrl.toString());
}

export async function requestData<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<ApiResponse<T>>(config);
  return unwrapApiResponse(response.data);
}
