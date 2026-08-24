import type {
  CreateUserRequest,
  AuthUser,
  PageResult,
  UpdateUserStatusRequest,
  UserListQuery,
  UserRecord,
  UpdateProfileRequest,
  UpdatePasswordRequest,
  UpdateUserDataScopeRequest,
  UpdateUserSecurityLevelRequest,
  UpdateUserRoleRequest,
  PersonalDataExport,
  PasswordStatus,
  PrivacyConsentRequest,
  ResetUserPasswordRequest,
} from "@admin-x/shared";

import { requestData } from "./http";

export const usersApi = {
  passwordStatus() {
    return requestData<PasswordStatus>({
      method: "GET",
      url: "/users/me/password-status",
    });
  },
  updatePassword(payload: UpdatePasswordRequest) {
    return requestData<null>({
      data: payload,
      method: "PATCH",
      url: "/users/me/password",
    });
  },
  resetPassword(id: string, payload: ResetUserPasswordRequest) {
    return requestData<null>({
      data: payload,
      method: "PATCH",
      url: `/users/${id}/password`,
    });
  },
  updateProfile(payload: UpdateProfileRequest) {
    return requestData<AuthUser>({
      data: payload,
      method: "PATCH",
      url: "/users/me",
    });
  },
  create(payload: CreateUserRequest) {
    return requestData<UserRecord>({
      data: payload,
      method: "POST",
      url: "/users",
    });
  },
  list(query: UserListQuery) {
    return requestData<PageResult<UserRecord>>({
      method: "GET",
      params: query,
      url: "/users",
    });
  },
  remove(id: string) {
    return requestData<null>({
      method: "DELETE",
      url: `/users/${id}`,
    });
  },
  updateRole(id: string, payload: UpdateUserRoleRequest) {
    return requestData<UserRecord>({
      data: payload,
      method: "PATCH",
      url: `/users/${id}/role`,
    });
  },
  updateDataScope(id: string, payload: UpdateUserDataScopeRequest) {
    return requestData<UserRecord>({
      data: payload,
      method: "PATCH",
      url: `/users/${id}/data-scope`,
    });
  },
  updateSecurityLevel(id: string, payload: UpdateUserSecurityLevelRequest) {
    return requestData<UserRecord>({
      data: payload,
      method: "PATCH",
      url: `/users/${id}/security-level`,
    });
  },
  updateStatus(id: string, payload: UpdateUserStatusRequest) {
    return requestData<UserRecord>({
      data: payload,
      method: "PATCH",
      url: `/users/${id}/status`,
    });
  },
  unlock(id: string) {
    return requestData<UserRecord>({
      method: "PATCH",
      url: `/users/${id}/unlock`,
    });
  },
  exportPersonalData() {
    return requestData<PersonalDataExport>({
      method: "GET",
      url: "/users/me/privacy/export",
    });
  },
  acceptPrivacyNotice(payload: PrivacyConsentRequest) {
    return requestData<AuthUser>({
      data: payload,
      method: "POST",
      url: "/users/me/privacy/consent",
    });
  },
  erasePersonalData(currentPassword: string) {
    return requestData<null>({
      data: { currentPassword },
      method: "POST",
      url: "/users/me/privacy/erase",
    });
  },
};
