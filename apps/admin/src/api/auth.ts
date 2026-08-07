import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
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
  me() {
    return requestData<AuthUser>({
      method: "GET",
      url: "/auth/me",
    });
  },
};
