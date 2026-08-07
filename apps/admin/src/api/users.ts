import type {
  CreateUserRequest,
  PageResult,
  UpdateUserStatusRequest,
  UserListQuery,
  UserRecord,
} from "@admin-x/shared";

import { requestData } from "./http";

export const usersApi = {
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
  updateStatus(id: string, payload: UpdateUserStatusRequest) {
    return requestData<UserRecord>({
      data: payload,
      method: "PATCH",
      url: `/users/${id}/status`,
    });
  },
};
