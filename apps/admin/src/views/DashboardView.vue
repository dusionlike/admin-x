<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Component } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { GaugeChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { init, use } from "echarts/core";
import type { ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import {
  ArrowRight,
  DataAnalysis,
  Document,
  Loading,
  Plus,
  Setting,
  TrendCharts,
  UserFilled,
} from "@element-plus/icons-vue";

import type { DashboardOverview } from "@admin-x/shared";
import { getErrorMessage } from "@admin-x/shared";

import { dashboardApi } from "@/api/dashboard";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

use([CanvasRenderer, GridComponent, LineChart, GaugeChart, TooltipComponent]);

const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore();
const overview = ref<DashboardOverview | null>(null);
const loading = ref(true);
const trendChartRef = ref<HTMLDivElement | null>(null);
const healthChartRef = ref<HTMLDivElement | null>(null);

let trendChart: ECharts | null = null;
let healthChart: ECharts | null = null;

const metricIcons: Record<string, Component> = {
  active: TrendCharts,
  health: Setting,
  users: UserFilled,
  visits: DataAnalysis,
};

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return "早上好";
  }
  if (hour < 18) {
    return "下午好";
  }
  return "晚上好";
});

const recentActivities = computed(() => overview.value?.recentActivity.slice(0, 5) ?? []);

function metricIcon(key: string) {
  return metricIcons[key] ?? DataAnalysis;
}

function formatMetric(value: number, suffix?: string) {
  return `${value.toLocaleString("zh-CN")}${suffix ?? ""}`;
}

function cssVariable(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function getChartColors() {
  return {
    content: cssVariable("--ax-content", "#344054"),
    heading: cssVariable("--ax-heading", "#1d2939"),
    line: cssVariable("--ax-line-soft", "#f0f2f6"),
    muted: cssVariable("--ax-muted", "#718096"),
    primary: cssVariable("--ax-primary", "#6755e8"),
    ringTrack: cssVariable("--ax-ring-track", "#e9e7fd"),
    surface: cssVariable("--ax-surface", "#ffffff"),
  };
}

function renderTrendChart() {
  const container = trendChartRef.value;
  if (!container || !overview.value) {
    return;
  }

  if (!trendChart || trendChart.getDom() !== container) {
    trendChart?.dispose();
    trendChart = init(container);
  }

  const colors = getChartColors();
  trendChart.setOption({
    animationDuration: 500,
    grid: { bottom: 20, containLabel: true, left: 12, right: 14, top: 20 },
    tooltip: {
      axisPointer: { lineStyle: { color: colors.primary, type: "dashed" } },
      backgroundColor: colors.surface,
      borderColor: colors.line,
      formatter: "{b}<br/>登录次数：{c}",
      textStyle: { color: colors.content, fontSize: 11 },
      trigger: "axis",
    },
    xAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: colors.muted, fontSize: 10, margin: 12 },
      boundaryGap: false,
      data: overview.value.trend.map((item) => item.label),
      type: "category",
    },
    yAxis: {
      axisLabel: { color: colors.muted, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      min: 0,
      splitLine: { lineStyle: { color: colors.line, type: "dashed" } },
      splitNumber: 4,
      type: "value",
    },
    series: [
      {
        areaStyle: { color: colors.ringTrack, opacity: 0.55 },
        data: overview.value.trend.map((item) => item.value),
        emphasis: { focus: "series" },
        itemStyle: { borderColor: colors.surface, borderWidth: 2, color: colors.primary },
        lineStyle: { color: colors.primary, width: 3 },
        smooth: true,
        symbol: "circle",
        symbolSize: 7,
        type: "line",
      },
    ],
  });
}

function renderHealthChart() {
  const container = healthChartRef.value;
  if (!container) {
    return;
  }

  if (!healthChart || healthChart.getDom() !== container) {
    healthChart?.dispose();
    healthChart = init(container);
  }

  const colors = getChartColors();
  healthChart.setOption({
    animationDuration: 700,
    series: [
      {
        anchor: { show: false },
        axisLine: {
          lineStyle: {
            color: [[1, colors.ringTrack]],
            width: 13,
          },
        },
        axisLabel: { show: false },
        axisTick: { show: false },
        center: ["50%", "50%"],
        data: [{ name: "运行状态", value: 99.9 }],
        detail: {
          color: colors.heading,
          fontSize: 22,
          fontWeight: 700,
          offsetCenter: [0, "-2%"],
          valueAnimation: true,
          formatter: "{value}%",
        },
        endAngle: -270,
        pointer: { show: false },
        progress: {
          itemStyle: { color: colors.primary },
          roundCap: true,
          show: true,
          width: 13,
        },
        radius: "92%",
        splitLine: { show: false },
        startAngle: 90,
        title: { color: colors.muted, fontSize: 10, offsetCenter: [0, "31%"], show: true },
        type: "gauge",
      },
    ],
  });
}

async function renderCharts() {
  await nextTick();
  renderTrendChart();
  renderHealthChart();
}

function resizeCharts() {
  trendChart?.resize();
  healthChart?.resize();
}

function activityIcon(type: string) {
  if (type === "create") {
    return Plus;
  }
  if (type === "system") {
    return Setting;
  }
  if (type === "update") {
    return Document;
  }
  return UserFilled;
}

function navigateTo(route: string) {
  void router.push(route);
}

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await dashboardApi.getOverview();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

watch(overview, () => void renderCharts(), { deep: true });
watch(
  () => themeStore.isDark,
  () => void renderCharts(),
);

onMounted(() => {
  window.addEventListener("resize", resizeCharts);
  void loadOverview();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", resizeCharts);
  trendChart?.dispose();
  healthChart?.dispose();
  trendChart = null;
  healthChart = null;
});
</script>

<template>
  <div class="dashboard-page">
    <div class="page-heading dashboard-heading">
      <div>
        <p class="page-kicker">OVERVIEW</p>
        <h1>{{ greeting }}，{{ authStore.user?.displayName ?? "管理员" }}</h1>
        <p class="page-description">这里是今天的业务概览，愿你拥有高效且从容的一天。</p>
      </div>
      <div class="heading-actions">
        <el-tag class="live-tag" effect="plain"><span></span>系统运行正常</el-tag>
        <el-button :loading="loading" @click="loadOverview">刷新数据</el-button>
      </div>
    </div>

    <el-skeleton v-if="loading && !overview" :rows="8" animated />

    <template v-else-if="overview">
      <div class="metric-grid">
        <el-card
          v-for="metric in overview.metrics"
          :key="metric.key"
          class="metric-card"
          shadow="never"
        >
          <div class="metric-card__top">
            <span class="metric-card__label">{{ metric.label }}</span>
            <span
              class="metric-card__icon"
              :style="{ color: metric.color, backgroundColor: `${metric.color}14` }"
            >
              <el-icon :size="18"><component :is="metricIcon(metric.icon)" /></el-icon>
            </span>
          </div>
          <div class="metric-card__value">{{ formatMetric(metric.value, metric.suffix) }}</div>
          <div class="metric-card__trend" :class="{ 'is-neutral': metric.trend === 0 }">
            <span v-if="metric.trend > 0">↑ {{ metric.trend }}%</span>
            <span v-else-if="metric.trend < 0">↓ {{ Math.abs(metric.trend) }}%</span>
            <span v-else>—</span>
            <em>{{ metric.trendLabel }}</em>
          </div>
        </el-card>
      </div>

      <div class="dashboard-grid dashboard-grid--main">
        <el-card class="dashboard-card trend-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <h2>登录趋势</h2>
                <p>过去 7 天的后台登录情况</p>
              </div>
              <el-button text type="primary"
                >最近 7 天 <el-icon><ArrowRight /></el-icon
              ></el-button>
            </div>
          </template>
          <div class="trend-summary">
            <strong>{{
              overview.trend.reduce((sum, item) => sum + item.value, 0).toLocaleString("zh-CN")
            }}</strong>
            <span>总登录次数</span>
          </div>
          <div ref="trendChartRef" class="trend-chart" aria-label="过去七天登录趋势图"></div>
        </el-card>

        <el-card class="dashboard-card activity-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <h2>最近动态</h2>
                <p>团队正在发生的事情</p>
              </div>
              <el-button text type="primary">查看全部</el-button>
            </div>
          </template>
          <div class="activity-list">
            <div v-for="activity in recentActivities" :key="activity.id" class="activity-item">
              <span class="activity-item__icon"
                ><el-icon><component :is="activityIcon(activity.type)" /></el-icon
              ></span>
              <div class="activity-item__copy">
                <strong>{{ activity.title }}</strong>
                <span>{{ activity.description }}</span>
              </div>
              <time>{{ activity.time }}</time>
            </div>
          </div>
        </el-card>
      </div>

      <div class="dashboard-grid dashboard-grid--bottom">
        <el-card class="dashboard-card quick-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <h2>快捷入口</h2>
                <p>常用功能，一键直达</p>
              </div>
            </div>
          </template>
          <div class="quick-action-grid">
            <button
              v-for="action in overview.quickActions"
              :key="action.key"
              class="quick-action"
              type="button"
              @click="navigateTo(action.route)"
            >
              <span
                class="quick-action__icon"
                :style="{ color: action.color, backgroundColor: `${action.color}14` }"
              >
                <el-icon :size="18"><component :is="metricIcon(action.icon)" /></el-icon>
              </span>
              <span class="quick-action__copy">
                <strong>{{ action.title }}</strong>
                <small>{{ action.description }}</small>
              </span>
              <el-icon class="quick-action__arrow"><ArrowRight /></el-icon>
            </button>
          </div>
        </el-card>

        <el-card class="dashboard-card health-card" shadow="never">
          <template #header>
            <div class="card-heading">
              <div>
                <h2>服务状态</h2>
                <p>核心服务实时状态</p>
              </div>
              <span class="health-status"><i></i>全部正常</span>
            </div>
          </template>
          <div ref="healthChartRef" class="health-ring" aria-label="服务运行状态图"></div>
          <div class="health-items">
            <div>
              <span><i class="health-dot health-dot--green"></i>管理 API</span><strong>正常</strong>
            </div>
            <div>
              <span><i class="health-dot health-dot--green"></i>数据库</span><strong>正常</strong>
            </div>
            <div>
              <span><i class="health-dot health-dot--yellow"></i>消息队列</span
              ><strong>监控中</strong>
            </div>
          </div>
        </el-card>
      </div>
    </template>

    <div v-else class="empty-state">
      <el-icon :size="30"><Loading /></el-icon>
      <p>暂时无法加载工作台数据</p>
      <el-button type="primary" @click="loadOverview">重新加载</el-button>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
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

.heading-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.live-tag {
  height: 30px;
  color: var(--ax-success-text);
  font-size: 11px;
  background: var(--ax-success-soft);
  border-color: var(--ax-success-line);
}

.live-tag span {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  vertical-align: 1px;
  background: #40c993;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgb(64 201 147 / 13%);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.metric-card {
  min-height: 150px;
}

.metric-card :deep(.el-card__body) {
  padding: 20px;
}

.metric-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.metric-card__label {
  color: var(--ax-muted);
  font-size: 12px;
}

.metric-card__icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
}

.metric-card__value {
  margin-top: 13px;
  color: var(--ax-heading);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.055em;
}

.metric-card__trend {
  margin-top: 10px;
  color: #37ad84;
  font-size: 11px;
}

.metric-card__trend em {
  margin-left: 5px;
  color: var(--ax-muted);
  font-style: normal;
}

.metric-card__trend.is-neutral {
  color: #8e99ab;
}

.dashboard-grid {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.dashboard-grid--main {
  grid-template-columns: minmax(0, 1.25fr) minmax(360px, 0.75fr);
}

.dashboard-grid--bottom {
  grid-template-columns: minmax(0, 1.25fr) minmax(360px, 0.75fr);
}

.dashboard-card {
  min-width: 0;
}

.dashboard-card :deep(.el-card__header) {
  padding: 20px 22px 16px;
  border-bottom-color: var(--ax-line-soft);
}

.dashboard-card :deep(.el-card__body) {
  padding: 18px 22px 22px;
}

.trend-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
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

.card-heading .el-button {
  height: auto;
  padding: 0;
  font-size: 11px;
}

.card-heading .el-button .el-icon {
  margin-left: 3px;
}

.trend-summary {
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin-bottom: 12px;
}

.trend-summary strong {
  color: var(--ax-heading);
  font-size: 26px;
  letter-spacing: -0.05em;
}

.trend-summary span {
  color: var(--ax-muted);
  font-size: 11px;
}

.trend-chart {
  flex: 1 1 160px;
  min-height: 160px;
  width: 100%;
  padding-top: 8px;
  border-top: 1px dashed var(--ax-line-soft);
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 17px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.activity-item__icon {
  display: grid;
  flex: 0 0 auto;
  width: 31px;
  height: 31px;
  place-items: center;
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
  border-radius: 9px;
}

.activity-item__copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.activity-item__copy strong {
  overflow: hidden;
  color: var(--ax-content);
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-item__copy span,
.activity-item time {
  color: var(--ax-muted);
  font-size: 10px;
}

.activity-item time {
  flex: 0 0 auto;
}

.quick-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quick-action {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 12px 10px;
  text-align: left;
  cursor: pointer;
  background: var(--ax-surface-muted);
  border: 1px solid var(--ax-line-soft);
  border-radius: 9px;
  transition: all 0.2s ease;
}

.quick-action:hover {
  background: var(--ax-primary-soft);
  border-color: var(--ax-primary);
  transform: translateY(-1px);
}

.quick-action__icon {
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  margin-right: 9px;
  place-items: center;
  border-radius: 8px;
}

.quick-action__copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.quick-action__copy strong {
  overflow: hidden;
  color: var(--ax-content);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-action__copy small {
  overflow: hidden;
  color: var(--ax-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-action__arrow {
  flex: 0 0 auto;
  color: var(--ax-muted);
  font-size: 13px;
}

.health-status {
  color: var(--ax-success-text);
  font-size: 10px;
}

.health-status i,
.health-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 5px;
  vertical-align: 1px;
  border-radius: 50%;
}

.health-status i,
.health-dot--green {
  background: #48c797;
}

.health-dot--yellow {
  background: #f2bd5d;
}

.health-ring {
  width: 170px;
  height: 170px;
  margin: 0 auto 2px;
}

.health-items {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 12px;
  border-top: 1px solid var(--ax-line-soft);
}

.health-items div {
  display: flex;
  justify-content: space-between;
  color: var(--ax-muted);
  font-size: 10px;
}

.health-items strong {
  color: #4cb990;
  font-size: 10px;
  font-weight: 500;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: #9aa5b5;
}

.empty-state p {
  margin: 14px 0;
  font-size: 13px;
}

@media (max-width: 1100px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-grid--main,
  .dashboard-grid--bottom {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .heading-actions {
    width: 100%;
    justify-content: space-between;
  }

  .metric-grid {
    gap: 10px;
  }

  .metric-card :deep(.el-card__body) {
    padding: 14px;
  }

  .metric-card__value {
    font-size: 22px;
  }

  .quick-action-grid {
    grid-template-columns: 1fr;
  }
}
</style>
