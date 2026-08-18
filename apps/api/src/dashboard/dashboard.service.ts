import { Inject, Injectable } from "@nestjs/common";

import { ROLE_DEFINITIONS } from "@admin-x/shared";
import type { AnalyticsOverview, DashboardOverview, TrendItem } from "@admin-x/shared";

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
          route: "/analytics",
          title: "数据分析",
        },
        {
          color: "#edaa47",
          description: "查看角色权限边界",
          icon: "health",
          key: "health",
          route: "/security",
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

  getAnalytics(): AnalyticsOverview {
    const today = new Date();
    const trendStart = new Date(today.getTime() - 6 * DAY_IN_MILLISECONDS).toISOString();
    const trend = buildTrend(today, this.database.getDailyVisits(trendStart));
    const totalVisits = trend.reduce((sum, item) => sum + item.value, 0);
    const peakDay = trend.reduce(
      (peak, item) => (item.value > peak.value ? item : peak),
      trend[0] ?? { label: dayKey(today), value: 0 },
    );
    const roleCounts = this.countBy("role");
    const statusCounts = this.countBy("status");

    return {
      roleDistribution: ROLE_DEFINITIONS.map((definition) => ({
        key: definition.code,
        label: definition.label,
        value: roleCounts.get(definition.code) ?? 0,
      })),
      statusDistribution: [
        { key: "active", label: "正常", value: statusCounts.get("active") ?? 0 },
        { key: "invited", label: "待激活", value: statusCounts.get("invited") ?? 0 },
        { key: "suspended", label: "已停用", value: statusCounts.get("suspended") ?? 0 },
      ],
      summary: {
        activeUsers: this.usersService.countByStatus("active"),
        averageDailyVisits: Number((totalVisits / 7).toFixed(1)),
        peakDay,
        totalUsers: this.usersService.count(),
        totalVisits,
      },
      trend,
    };
  }

  private countBy(column: "role" | "status"): Map<string, number> {
    const rows = this.database.connection
      .prepare(`SELECT ${column} AS key, COUNT(*) AS count FROM users GROUP BY ${column}`)
      .all() as Array<{ key?: string; count?: number | bigint }>;
    return new Map(rows.map((row) => [String(row.key), toNumber(row.count)]));
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

function toNumber(value: number | bigint | undefined): number {
  return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
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
