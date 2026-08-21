import type { SecurityPolicy } from "@admin-x/shared";

import { requestData } from "./http";

export const securityApi = {
  getPolicy() {
    return requestData<SecurityPolicy>({
      method: "GET",
      url: "/security/policy",
    });
  },
  updatePolicy(payload: SecurityPolicy) {
    return requestData<SecurityPolicy>({
      data: payload,
      method: "PATCH",
      url: "/security/policy",
    });
  },
};
