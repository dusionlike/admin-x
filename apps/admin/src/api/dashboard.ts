import type { DashboardOverview } from "@admin-x/shared";

import { requestData } from "./http";

export const dashboardApi = {
  getOverview() {
    return requestData<DashboardOverview>({
      method: "GET",
      url: "/dashboard/overview",
    });
  },
};
