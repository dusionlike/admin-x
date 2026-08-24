import type {
  AuthSession,
  AuthUser,
  ChangeExpiredPasswordRequest,
  EmailMfaCodeResponse,
  LoginRequest,
  LoginResponse,
  MfaPublicConfig,
  MfaSetupResponse,
  MfaStatus,
  ReauthenticationResponse,
  SetupAdminRequest,
  SetupStatus,
} from "@admin-x/shared";

import { requestData } from "./http";

export const authApi = {
  login(payload: LoginRequest) {
    return requestData<LoginResponse>({
      data: payload,
      method: "POST",
      url: "/auth/login",
    });
  },
  setup(payload: SetupAdminRequest) {
    return requestData<LoginResponse>({
      data: payload,
      method: "POST",
      url: "/auth/setup",
    });
  },
  setupStatus() {
    return requestData<SetupStatus>({
      method: "GET",
      url: "/auth/setup-status",
    });
  },
  mfaConfig() {
    return requestData<MfaPublicConfig>({
      method: "GET",
      url: "/auth/mfa/config",
    });
  },
  requestEmailCode(payload: { username: string; password: string }) {
    return requestData<EmailMfaCodeResponse>({
      data: payload,
      method: "POST",
      url: "/auth/mfa/email/request",
    });
  },
  changeExpiredPassword(payload: ChangeExpiredPasswordRequest) {
    return requestData<null>({
      data: payload,
      method: "POST",
      url: "/auth/password/expired",
    });
  },
  me() {
    return requestData<AuthUser>({
      method: "GET",
      url: "/auth/me",
    });
  },
  logout() {
    return requestData<null>({
      method: "POST",
      url: "/auth/logout",
    });
  },
  sessions() {
    return requestData<AuthSession[]>({
      method: "GET",
      url: "/auth/sessions",
    });
  },
  revokeSession(id: string) {
    return requestData<null>({
      method: "DELETE",
      url: `/auth/sessions/${id}`,
    });
  },
  reauthenticate(currentPassword: string) {
    return requestData<ReauthenticationResponse>({
      data: { currentPassword },
      method: "POST",
      url: "/auth/reauth",
    });
  },
  mfaStatus() {
    return requestData<MfaStatus>({
      method: "GET",
      url: "/auth/mfa/status",
    });
  },
  setupMfa(currentPassword: string) {
    return requestData<MfaSetupResponse>({
      data: { currentPassword },
      method: "POST",
      url: "/auth/mfa/setup",
    });
  },
  enableMfa(code: string) {
    return requestData<MfaStatus>({
      data: { code },
      method: "POST",
      url: "/auth/mfa/enable",
    });
  },
  disableMfa(currentPassword: string, code: string) {
    return requestData<MfaStatus>({
      data: { code, currentPassword },
      method: "POST",
      url: "/auth/mfa/disable",
    });
  },
};
