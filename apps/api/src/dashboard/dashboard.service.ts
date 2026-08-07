import { Inject, Injectable } from "@nestjs/common";

import type { DashboardOverview, TrendItem } from "@admin-x/shared";

import { DatabaseService } from "../database/database.service.js";
import { UsersService } from "../users/users.service.js";

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  getOverview(): DashboardOverview {
    const today = new Date();
    const todayStart = `${dayKey(today)}T00:00:00.000Z`;
    const trendStart = new Date(today.getTime() - 6 * DAY_IN_MILLISECONDS).toISOString();
    const dailyVisits = this.database.getDailyVisits(trendStart);
    const trend = buildTrend(today, dailyVisits);

    return {
      metrics: [
        {
          color: "#6755e8",
          icon: "users",
          key: "users",
          label: "用户总数",
          suffix: "",
          trend: 0,
          trendLabel: "数据库实时",
          value: this.usersService.count(),
        },
        {
          color: "#3a9de8",
          icon: "visits",
          key: "visits",
          label: "今日访问",
          trend: 0,
          trendLabel: "登录记录",
          value: this.database.getVisitCount(todayStart),
        },
        {
          color: "#39b993",
          icon: "active",
          key: "active",
          label: "活跃用户",
          trend: 0,
          trendLabel: "当前启用",
          value: this.usersService.countByStatus("active"),
        },
        {
          color: "#edaa47",
          icon: "health",
          key: "health",
          label: "服务健康度",
          suffix: "%",
          trend: 0,
          trendLabel: "SQLite 连接",
          value: this.database.isHealthy() ? 100 : 0,
        },
      ],
      quickActions: [
        {
          color: "#6755e8",
          description: "管理工作区成员",
          icon: "users",
          key: "users",
          route: "/users",
          title: "用户管理",
        },
        {
          color: "#3a9de8",
          description: "查看业务数据走势",
          icon: "visits",
          key: "analytics",
          route: "/dashboard?view=analytics",
          title: "数据分析",
        },
        {
          color: "#39b993",
          description: "配置工作台偏好",
          icon: "active",
          key: "settings",
          route: "/settings",
          title: "系统设置",
        },
        {
          color: "#edaa47",
          description: "检查系统运行状态",
          icon: "health",
          key: "health",
          route: "/settings?view=security",
          title: "安全中心",
        },
      ],
      recentActivity: this.database.getRecentActivities(10).map((activity) => ({
        description: activity.description,
        id: activity.id,
        time: formatActivityTime(activity.createdAt),
        title: activity.title,
        type: activity.type,
      })),
      trend,
    };
  }
}

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function buildTrend(today: Date, dailyVisits: Map<string, number>): TrendItem[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime() - (6 - index) * DAY_IN_MILLISECONDS);
    const label = dayKey(date);
    return { label, value: dailyVisits.get(label) ?? 0 };
  });
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatActivityTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return "刚刚";
  }
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "昨天" : `${days} 天前`;
}
