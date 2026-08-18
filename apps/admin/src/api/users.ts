import type {
  CreateUserRequest,
  AuthUser,
  PageResult,
  UpdateUserStatusRequest,
  UserListQuery,
  UserRecord,
  UpdateProfileRequest,
  UpdatePasswordRequest,
  UpdateUserRoleRequest,
} from "@admin-x/shared";

import { requestData } from "./http";

export const usersApi = {
  updatePassword(payload: UpdatePasswordRequest) {
    return requestData<null>({
      data: payload,
      method: "PATCH",
      url: "/users/me/password",
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
  updateStatus(id: string, payload: UpdateUserStatusRequest) {
    return requestData<UserRecord>({
      data: payload,
      method: "PATCH",
      url: `/users/${id}/status`,
    });
  },
};
