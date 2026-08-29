import type {
  AuthSession,
  AuthUser,
  ChangeExpiredPasswordRequest,
  EmailMfaCodeResponse,
  LoginCaptchaResponse,
  LoginRequest,
  LoginResponse,
  MfaPublicConfig,
  ReauthenticationResponse,
  SetupAdminRequest,
  SetupStatus,
} from "@admin-x/shared";

import { requestData } from "./http";

export const authApi = {
  loginCaptcha() {
    return requestData<LoginCaptchaResponse>({
      method: "GET",
      url: "/auth/captcha",
    });
  },
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
  requestEmailCode(payload: {
    captchaCode?: string;
    captchaId?: string;
    username: string;
    password: string;
  }) {
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
};
