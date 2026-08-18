import type { AnalyticsOverview, DashboardOverview } from "@admin-x/shared";

import { requestData } from "./http";

export const dashboardApi = {
  getAnalytics() {
    return requestData<AnalyticsOverview>({
      method: "GET",
      url: "/dashboard/analytics",
    });
  },
  getOverview() {
    return requestData<DashboardOverview>({
      method: "GET",
      url: "/dashboard/overview",
    });
  },
};
