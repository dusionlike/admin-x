<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";

import type { AnalyticsDistributionItem, AnalyticsOverview } from "@admin-x/shared";
import { getErrorMessage } from "@admin-x/shared";

import { dashboardApi } from "@/api/dashboard";

const overview = ref<AnalyticsOverview | null>(null);
const loading = ref(true);

const roleColors: Record<string, string> = {
  "audit-admin": "#edaa47",
  "business-admin": "#39b993",
  operator: "#93a3bb",
  readonly: "#b07bec",
  "security-admin": "#3a9de8",
  "system-admin": "#6755e8",
};

const statusColors: Record<string, string> = {
  active: "#39b993",
  invited: "#edaa47",
  suspended: "#93a3bb",
};

const totalUsers = computed(() => overview.value?.summary.totalUsers ?? 0);
const activeRate = computed(() => {
  if (!totalUsers.value) {
    return 0;
  }
  return Math.round(((overview.value?.summary.activeUsers ?? 0) / totalUsers.value) * 100);
});
const maxTrend = computed(() =>
  Math.max(1, ...(overview.value?.trend.map((item) => item.value) ?? [])),
);

const summaryCards = computed(() => {
  const summary = overview.value?.summary;
  return [
    {
      caption: "过去 7 天登录访问",
      key: "visits",
      label: "访问总量",
      value: formatNumber(summary?.totalVisits ?? 0),
    },
    {
      caption: "按 7 天周期计算",
      key: "average",
      label: "日均访问",
      value: formatNumber(summary?.averageDailyVisits ?? 0),
    },
    {
      caption: "当前工作区账号",
      key: "users",
      label: "用户总数",
      value: formatNumber(summary?.totalUsers ?? 0),
    },
    {
      caption: "正常状态账号占比",
      key: "active",
      label: "账号活跃率",
      value: `${activeRate.value}%`,
    },
  ];
});

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatDay(value: string) {
  return value.slice(5).replace("-", "/");
}

function barHeight(value: number) {
  return Math.max(value > 0 ? 8 : 2, Math.round((value / maxTrend.value) * 100));
}

function distributionWidth(value: number, total: number) {
  return total ? Math.max(value > 0 ? 4 : 0, Math.round((value / total) * 100)) : 0;
}

function distributionColor(key: string) {
  return roleColors[key] ?? statusColors[key] ?? "#6755e8";
}

function peakDayLabel() {
  return overview.value ? formatDay(overview.value.summary.peakDay.label) : "-";
}

function roleTotal() {
  return overview.value?.roleDistribution.reduce((sum, item) => sum + item.value, 0) ?? 0;
}

function statusTotal() {
  return overview.value?.statusDistribution.reduce((sum, item) => sum + item.value, 0) ?? 0;
}

function roleWidth(item: AnalyticsDistributionItem) {
  return distributionWidth(item.value, roleTotal());
}

function statusWidth(item: AnalyticsDistributionItem) {
  return distributionWidth(item.value, statusTotal());
}

async function loadAnalytics() {
  loading.value = true;
  try {
    overview.value = await dashboardApi.getAnalytics();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "无法加载数据分析"));
  } finally {
    loading.value = false;
  }
}

onMounted(() => void loadAnalytics());
</script>

<template>
  <div class="analytics-page">
    <div class="page-heading analytics-heading">
      <div>
        <p class="page-kicker">ANALYTICS</p>
        <h1>数据分析</h1>
        <p class="page-description">从访问趋势、账号结构和状态分布观察管理中心运行情况。</p>
      </div>
      <el-button :loading="loading" @click="loadAnalytics">刷新分析</el-button>
    </div>

    <el-skeleton v-if="loading && !overview" :rows="8" animated />

    <template v-else-if="overview">
      <div class="analytics-summary-grid">
        <el-card
          v-for="card in summaryCards"
          :key="card.key"
          class="analytics-summary-card"
          shadow="never"
        >
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.caption }}</small>
        </el-card>
      </div>

      <div class="analytics-grid analytics-grid--main">
        <el-card class="analytics-card trend-analysis-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <h2>访问趋势</h2>
                <p>过去 7 天登录访问次数</p>
              </div>
              <el-tag effect="plain">峰值 {{ peakDayLabel() }}</el-tag>
            </div>
          </template>
          <div class="trend-bars">
            <div v-for="item in overview.trend" :key="item.label" class="trend-column">
              <strong>{{ item.value }}</strong>
              <div class="trend-column__track">
                <span :style="{ height: `${barHeight(item.value)}%` }"></span>
              </div>
              <small>{{ formatDay(item.label) }}</small>
            </div>
          </div>
          <p class="trend-caption">
            访问峰值为 {{ overview.summary.peakDay.value }} 次，日均访问
            {{ overview.summary.averageDailyVisits }} 次。
          </p>
        </el-card>

        <el-card class="analytics-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <h2>角色结构</h2>
                <p>当前账号按角色分布</p>
              </div>
            </div>
          </template>
          <div class="distribution-list">
            <div
              v-for="item in overview.roleDistribution"
              :key="item.key"
              class="distribution-item"
            >
              <div class="distribution-item__heading">
                <span
                  ><i :style="{ backgroundColor: distributionColor(item.key) }"></i
                  >{{ item.label }}</span
                >
                <strong>{{ item.value }}</strong>
              </div>
              <div class="distribution-track">
                <span
                  :style="{
                    width: `${roleWidth(item)}%`,
                    backgroundColor: distributionColor(item.key),
                  }"
                ></span>
              </div>
            </div>
          </div>
        </el-card>
      </div>

      <div class="analytics-grid analytics-grid--bottom">
        <el-card class="analytics-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <h2>账号状态</h2>
                <p>账号启用和生命周期状态</p>
              </div>
            </div>
          </template>
          <div class="status-overview">
            <div class="status-overview__total">
              <strong>{{ formatNumber(totalUsers) }}</strong>
              <span>账号总数</span>
            </div>
            <div class="distribution-list">
              <div
                v-for="item in overview.statusDistribution"
                :key="item.key"
                class="distribution-item"
              >
                <div class="distribution-item__heading">
                  <span
                    ><i :style="{ backgroundColor: distributionColor(item.key) }"></i
                    >{{ item.label }}</span
                  >
                  <strong>{{ item.value }}</strong>
                </div>
                <div class="distribution-track">
                  <span
                    :style="{
                      width: `${statusWidth(item)}%`,
                      backgroundColor: distributionColor(item.key),
                    }"
                  ></span>
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <el-card class="analytics-card insight-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <h2>分析摘要</h2>
                <p>根据当前数据生成的运行提示</p>
              </div>
            </div>
          </template>
          <div class="insight-list">
            <div>
              <strong>活跃账号</strong>
              <span>{{ overview.summary.activeUsers }} 个正常账号，占总数 {{ activeRate }}%。</span>
            </div>
            <div>
              <strong>访问峰值</strong>
              <span
                >{{ peakDayLabel() }} 访问量最高，共 {{ overview.summary.peakDay.value }} 次。</span
              >
            </div>
            <div>
              <strong>权限结构</strong>
              <span>角色分布独立统计，便于检查职责分离和最小权限落实情况。</span>
            </div>
          </div>
        </el-card>
      </div>
    </template>

    <div v-else class="empty-state">
      <p>暂时无法加载数据分析</p>
      <el-button type="primary" @click="loadAnalytics">重新加载</el-button>
    </div>
  </div>
</template>

<style scoped>
.analytics-page {
  max-width: 1440px;
  margin: 0 auto;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
}

.page-kicker {
  margin: 0 0 8px;
  color: var(--ax-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.page-heading h1 {
  margin: 0;
  color: var(--ax-heading);
  font-size: clamp(23px, 2.3vw, 30px);
  font-weight: 700;
  letter-spacing: -0.05em;
}

.page-description {
  margin: 8px 0 0;
  color: var(--ax-muted);
  font-size: 12px;
}

.analytics-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.analytics-summary-card {
  min-height: 138px;
}

.analytics-summary-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  min-height: 138px;
  padding: 20px;
}

.analytics-summary-card span,
.analytics-summary-card small {
  color: var(--ax-muted);
  font-size: 11px;
}

.analytics-summary-card strong {
  margin: 14px 0 7px;
  color: var(--ax-heading);
  font-size: 28px;
  letter-spacing: -0.055em;
}

.analytics-summary-card small {
  margin-top: auto;
  font-size: 10px;
}

.analytics-grid {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.analytics-grid--main {
  grid-template-columns: minmax(0, 1.25fr) minmax(360px, 0.75fr);
}

.analytics-grid--bottom {
  grid-template-columns: minmax(360px, 0.75fr) minmax(0, 1.25fr);
}

.analytics-card {
  min-width: 0;
}

.analytics-card :deep(.el-card__header) {
  padding: 20px 22px 16px;
  border-bottom-color: var(--ax-line-soft);
}

.analytics-card :deep(.el-card__body) {
  padding: 20px 22px 22px;
}

.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-heading h2 {
  margin: 0;
  color: var(--ax-content);
  font-size: 14px;
  font-weight: 700;
}

.card-heading p {
  margin: 5px 0 0;
  color: var(--ax-muted);
  font-size: 10px;
}

.card-heading .el-tag {
  font-size: 10px;
}

.trend-bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  gap: 12px;
  height: 250px;
  padding: 0 8px 6px;
  border-bottom: 1px solid var(--ax-line-soft);
}

.trend-column {
  display: flex;
  flex: 1;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.trend-column strong {
  color: var(--ax-content);
  font-size: 11px;
}

.trend-column small {
  color: var(--ax-muted);
  font-size: 9px;
}

.trend-column__track {
  display: flex;
  align-items: flex-end;
  width: min(32px, 72%);
  height: 174px;
  background: var(--ax-primary-soft);
  border-radius: 8px 8px 3px 3px;
}

.trend-column__track span {
  display: block;
  width: 100%;
  background: linear-gradient(180deg, var(--ax-primary), #9a8df2);
  border-radius: 8px 8px 3px 3px;
}

.trend-caption {
  margin: 16px 0 0;
  color: var(--ax-muted);
  font-size: 11px;
}

.distribution-list {
  display: flex;
  flex-direction: column;
  gap: 19px;
}

.distribution-item__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--ax-content);
  font-size: 11px;
}

.distribution-item__heading span {
  display: flex;
  align-items: center;
  min-width: 0;
}

.distribution-item__heading i {
  display: inline-block;
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-right: 7px;
  border-radius: 50%;
}

.distribution-item__heading strong {
  font-size: 12px;
}

.distribution-track {
  height: 7px;
  margin-top: 8px;
  overflow: hidden;
  background: var(--ax-line-soft);
  border-radius: 999px;
}

.distribution-track span {
  display: block;
  height: 100%;
  min-width: 0;
  border-radius: inherit;
}

.status-overview {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 28px;
  align-items: center;
}

.status-overview__total {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-right: 28px;
  border-right: 1px solid var(--ax-line-soft);
}

.status-overview__total strong {
  color: var(--ax-heading);
  font-size: 32px;
  letter-spacing: -0.06em;
}

.status-overview__total span {
  color: var(--ax-muted);
  font-size: 10px;
}

.insight-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.insight-list > div {
  min-height: 92px;
  padding: 14px;
  background: var(--ax-surface-muted);
  border: 1px solid var(--ax-line-soft);
  border-radius: 9px;
}

.insight-list strong,
.insight-list span {
  display: block;
}

.insight-list strong {
  color: var(--ax-content);
  font-size: 11px;
}

.insight-list span {
  margin-top: 8px;
  color: var(--ax-muted);
  font-size: 10px;
  line-height: 1.6;
}

.empty-state {
  display: flex;
  min-height: 400px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--ax-muted);
  font-size: 13px;
}

.empty-state p {
  margin: 0 0 14px;
}

@media (max-width: 1100px) {
  .analytics-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-grid--main,
  .analytics-grid--bottom {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .analytics-summary-grid {
    gap: 10px;
  }

  .analytics-summary-card :deep(.el-card__body) {
    padding: 14px;
  }

  .analytics-summary-card strong {
    font-size: 22px;
  }

  .status-overview {
    grid-template-columns: 1fr;
  }

  .status-overview__total {
    padding: 0 0 14px;
    border-right: 0;
    border-bottom: 1px solid var(--ax-line-soft);
  }

  .insight-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 460px) {
  .analytics-summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
