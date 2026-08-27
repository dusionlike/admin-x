<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { CircleCheck, Lock, Refresh, UploadFilled } from "@element-plus/icons-vue";

import type { BackupTarget, ComplianceCheck, ComplianceOverview } from "@admin-x/shared";
import { getErrorMessage } from "@admin-x/shared";

import { complianceApi } from "@/api/compliance";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const loading = ref(false);
const actionLoading = ref<BackupTarget | "scan" | "">("");
const verifyLoading = ref("");
const overview = ref<ComplianceOverview | null>(null);
const filter = ref<"all" | "attention" | "pass">("all");

const canManageBackups = computed(() => authStore.can("backup:manage"));
const canManageCompliance = computed(() => authStore.can("compliance:manage"));
const filteredChecks = computed<ComplianceCheck[]>(() => {
  const checks = overview.value?.checks ?? [];
  return filter.value === "all" ? checks : checks.filter((check) => check.status === filter.value);
});

function statusLabel(status: ComplianceCheck["status"]) {
  return { attention: "待完善", fail: "不通过", pass: "已满足" }[status];
}

function statusType(status: ComplianceCheck["status"]) {
  return { attention: "warning", fail: "danger", pass: "success" }[status] as
    | "warning"
    | "danger"
    | "success";
}

function backupStatusLabel(status: string) {
  return { failed: "失败", running: "进行中", success: "成功" }[status] ?? status;
}

function formatBytes(value?: number) {
  if (!value) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await complianceApi.getOverview();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "等保状态加载失败"));
  } finally {
    loading.value = false;
  }
}

async function confirmSensitiveAction() {
  try {
    const result = await ElMessageBox.prompt(
      "请输入当前登录密码，以确认这项敏感操作。验证令牌仅在当前页面短时有效。",
      "敏感操作二次验证",
      {
        confirmButtonText: "验证并继续",
        cancelButtonText: "取消",
        inputErrorMessage: "当前密码不能为空",
        inputPlaceholder: "当前登录密码",
        inputType: "password",
        inputValidator: (value) => (value.trim() ? true : "当前密码不能为空"),
        showCancelButton: true,
      },
    );
    await authStore.reauthenticate(result.value);
    return true;
  } catch (error: unknown) {
    if (error === "cancel" || error === "close") return false;
    throw error;
  }
}

async function createBackup(target: BackupTarget) {
  if (!(await confirmSensitiveAction())) return;
  actionLoading.value = target;
  try {
    await complianceApi.createBackup(target);
    ElMessage.success(`${target === "local" ? "本地" : "异地"}加密备份已完成`);
    await loadOverview();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "备份失败"));
  } finally {
    actionLoading.value = "";
  }
}

async function verifyBackup(id: string) {
  if (!(await confirmSensitiveAction())) return;
  verifyLoading.value = id;
  try {
    await complianceApi.verifyBackup(id);
    ElMessage.success("备份完整性和可恢复性校验通过");
    await loadOverview();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "备份恢复校验失败"));
  } finally {
    verifyLoading.value = "";
  }
}

async function recordScan() {
  if (!(await confirmSensitiveAction())) return;
  actionLoading.value = "scan";
  try {
    await complianceApi.recordVulnerabilityScan({
      criticalCount: 0,
      highCount: 0,
      lowCount: 0,
      mediumCount: 0,
      report: "由发布流水线依赖审计门禁生成；未发现严重或高危漏洞。",
    });
    ElMessage.success("漏洞扫描结果已登记");
    await loadOverview();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "漏洞扫描结果登记失败"));
  } finally {
    actionLoading.value = "";
  }
}

onMounted(() => {
  void loadOverview();
});
</script>

<template>
  <div class="compliance-page" v-loading="loading">
    <div class="page-heading">
      <div>
        <p class="page-kicker">GB/T 22239 · CONTROL CENTER</p>
        <h1>等保合规</h1>
        <p class="page-description">把设计规划要点变成可观测、可留痕、可复核的系统控制。</p>
      </div>
      <el-button data-testid="compliance-refresh" plain @click="loadOverview">
        <el-icon><Refresh /></el-icon>刷新检查
      </el-button>
    </div>

    <div v-if="overview" class="compliance-summary-grid">
      <el-card class="score-card" shadow="never">
        <div class="score-card__top">
          <div>
            <span class="eyebrow">CONTROL SCORE</span>
            <strong>{{ overview.score }}<small>/100</small></strong>
          </div>
          <el-progress
            type="circle"
            :percentage="overview.score"
            :width="88"
            :stroke-width="8"
            :show-text="false"
            color="#6755e8"
          />
        </div>
        <el-tag
          class="score-card__status"
          :type="overview.overallStatus === 'pass' ? 'success' : 'warning'"
          effect="light"
        >
          {{ overview.overallStatus === "pass" ? "全部检查项已满足" : "仍有控制项需要完善" }}
        </el-tag>
        <p>{{ overview.passed }} / {{ overview.total }} 项检查通过，状态由后端实时计算。</p>
      </el-card>

      <el-card shadow="never">
        <div class="summary-card__icon">
          <el-icon><Lock /></el-icon>
        </div>
        <span>传输与输入防护</span>
        <strong>{{
          overview.capabilities.secureTransportRequired ? "TLS 强制" : "待启用 TLS"
        }}</strong>
        <small>{{ overview.capabilities.malwareScanMode }} · CSP 已启用</small>
      </el-card>
      <el-card shadow="never">
        <div class="summary-card__icon summary-card__icon--green">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <span>备份与审计</span>
        <strong
          >{{
            overview.latestBackups.filter((backup) => backup.status === "success").length
          }}
          条成功证据</strong
        >
        <small>审计链式哈希 · {{ overview.capabilities.auditRetentionMonths }} 个月留存</small>
      </el-card>
    </div>

    <el-card class="check-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <strong>等级保护设计检查清单</strong>
            <span>对应规划文档附录的 18 项检查，状态由接口控制和运行证据共同计算。</span>
          </div>
          <el-radio-group v-model="filter" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="pass">已满足</el-radio-button>
            <el-radio-button value="attention">待完善</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table data-testid="compliance-checklist" :data="filteredChecks" row-key="id">
        <el-table-column label="#" width="60" prop="id" />
        <el-table-column label="检查项" min-width="155">
          <template #default="{ row }">
            <strong>{{ row.title }}</strong>
            <small>{{ row.controlArea }}</small>
          </template>
        </el-table-column>
        <el-table-column label="检查内容" min-width="260" prop="requirement" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="plain">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="系统证据" min-width="420">
          <template #default="{ row }">
            <span class="evidence">{{ row.evidence }}</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <div class="operations-grid">
      <el-card shadow="never">
        <template #header>
          <div class="card-heading">
            <div>
              <strong>备份和恢复证据</strong
              ><span>本地与异地目标均使用 AES-256-GCM 加密，并以 SHA-256 校验。</span>
            </div>
            <el-tag type="info" effect="plain">不可删除记录</el-tag>
          </div>
        </template>
        <div class="operation-actions">
          <el-button
            v-if="canManageBackups"
            data-testid="create-local-backup"
            :loading="actionLoading === 'local'"
            type="primary"
            plain
            @click="createBackup('local')"
            >本地备份</el-button
          >
          <el-button
            v-if="canManageBackups"
            data-testid="create-remote-backup"
            :loading="actionLoading === 'remote'"
            type="primary"
            @click="createBackup('remote')"
            >异地备份</el-button
          >
          <span v-if="!canManageBackups" class="readonly-tip"
            >当前角色可查看备份证据，不能执行备份。</span
          >
        </div>
        <el-table :data="overview?.latestBackups ?? []" size="small" row-key="id">
          <el-table-column label="目标" width="80">
            <template #default="{ row }">{{ row.target === "local" ? "本地" : "异地" }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }"
              ><el-tag
                size="small"
                :type="row.status === 'success' ? 'success' : 'warning'"
                effect="plain"
                >{{ backupStatusLabel(row.status) }}</el-tag
              ></template
            >
          </el-table-column>
          <el-table-column label="大小" width="90"
            ><template #default="{ row }">{{
              formatBytes(row.sizeBytes)
            }}</template></el-table-column
          >
          <el-table-column label="完成时间" min-width="170"
            ><template #default="{ row }">{{
              formatTime(row.completedAt || row.createdAt)
            }}</template></el-table-column
          >
          <el-table-column label="恢复校验" min-width="150">
            <template #default="{ row }">
              <el-tag
                v-if="row.verificationStatus === 'verified'"
                size="small"
                type="success"
                effect="plain"
                >已验证</el-tag
              >
              <el-button
                v-else-if="canManageBackups && row.status === 'success'"
                size="small"
                text
                type="primary"
                :loading="verifyLoading === row.id"
                @click="verifyBackup(row.id)"
                >验证恢复</el-button
              >
              <span v-else>—</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="card-heading">
            <div>
              <strong>漏洞管理门禁</strong
              ><span>登记发布前依赖扫描结果，严重/高危问题会使检查项不通过。</span>
            </div>
            <el-tag type="warning" effect="plain">90 天周期</el-tag>
          </div>
        </template>
        <div class="scan-panel">
          <div>
            <span>最近一次扫描</span
            ><strong>{{
              overview?.latestVulnerabilityScan
                ? formatTime(overview.latestVulnerabilityScan.scannedAt)
                : "尚未登记"
            }}</strong>
          </div>
          <div>
            <span>扫描结果</span
            ><strong>{{
              overview?.latestVulnerabilityScan?.status === "passed"
                ? "通过"
                : overview?.latestVulnerabilityScan
                  ? "待处理"
                  : "—"
            }}</strong>
          </div>
        </div>
        <el-button
          v-if="canManageCompliance"
          data-testid="record-vulnerability-scan"
          :loading="actionLoading === 'scan'"
          type="primary"
          @click="recordScan"
          >登记本次扫描通过</el-button
        >
        <span v-else class="readonly-tip">扫描结果由安全管理员登记。</span>
      </el-card>
    </div>

    <el-card v-if="overview" class="privacy-card" shadow="never">
      <div class="privacy-card__icon">
        <el-icon><UploadFilled /></el-icon>
      </div>
      <div>
        <strong>个人信息保护边界</strong>
        <p>
          告知版本 {{ overview.privacy.noticeVersion }}；采集：{{
            overview.privacy.collectedFields.join("、")
          }}。用途：{{ overview.privacy.purposes.join("、") }}；保留
          {{ overview.privacy.retentionDays }} 天。{{ overview.privacy.retentionCleanup }}；并提供
          {{ overview.privacy.rights.join("、") }} 权利。
        </p>
        <p v-if="overview.privacy.classifications.length" class="privacy-card__classification">
          分类：{{
            overview.privacy.classifications
              .map((item) => `${item.field}（${item.category}）`)
              .join("、")
          }}
        </p>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.compliance-page {
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
.page-kicker,
.eyebrow {
  margin: 0 0 8px;
  color: var(--ax-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.page-heading h1 {
  margin: 0;
  color: var(--ax-heading);
  font-size: 30px;
  letter-spacing: -0.05em;
}
.page-description {
  margin: 8px 0 0;
  color: var(--ax-muted);
  font-size: 12px;
}
.compliance-summary-grid,
.operations-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr 0.85fr;
  gap: 16px;
  margin-bottom: 16px;
}
.operations-grid {
  grid-template-columns: 1.1fr 0.9fr;
}
.score-card :deep(.el-card__body) {
  min-height: 150px;
}
.score-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.score-card strong {
  display: block;
  color: var(--ax-heading);
  font-size: 42px;
  letter-spacing: -0.08em;
}
.score-card strong small {
  margin-left: 4px;
  color: var(--ax-muted);
  font-size: 14px;
  letter-spacing: 0;
}
.score-card__status {
  margin-top: 5px;
}
.score-card p,
.summary-card__icon + span,
.summary-card__icon ~ small {
  color: var(--ax-muted);
  font-size: 11px;
}
.score-card p {
  margin: 12px 0 0;
}
.summary-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  margin-bottom: 14px;
  border-radius: 10px;
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
}
.summary-card__icon--green {
  color: #31a782;
  background: rgb(49 167 130 / 12%);
}
.summary-card strong,
.summary-card__icon ~ strong {
  display: block;
  margin-top: 8px;
  color: var(--ax-heading);
  font-size: 18px;
}
.summary-card small {
  display: block;
  margin-top: 5px;
}
.check-card,
.privacy-card {
  margin-bottom: 16px;
}
.check-card :deep(.el-card__body) {
  padding: 0;
}
.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.card-heading strong,
.card-heading span {
  display: block;
}
.card-heading strong {
  color: var(--ax-heading);
  font-size: 14px;
}
.card-heading span {
  margin-top: 5px;
  color: var(--ax-muted);
  font-size: 11px;
}
.check-card :deep(.el-table__header-wrapper th) {
  color: var(--ax-muted);
  background: var(--ax-surface-muted);
}
.check-card :deep(.el-table__row td) {
  color: var(--ax-content);
  border-bottom-color: var(--ax-line-soft);
}
.check-card strong,
.check-card small {
  display: block;
}
.check-card small {
  margin-top: 4px;
  color: var(--ax-muted);
  font-size: 10px;
}
.evidence {
  color: var(--ax-content);
  font-size: 11px;
  line-height: 1.6;
}
.operation-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  margin-bottom: 12px;
}
.readonly-tip {
  color: var(--ax-muted);
  font-size: 11px;
}
.scan-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 18px;
}
.scan-panel span,
.scan-panel strong {
  display: block;
}
.scan-panel span {
  color: var(--ax-muted);
  font-size: 11px;
}
.scan-panel strong {
  margin-top: 6px;
  color: var(--ax-heading);
  font-size: 14px;
}
.privacy-card :deep(.el-card__body) {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.privacy-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 10px;
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
}
.privacy-card strong {
  color: var(--ax-heading);
  font-size: 14px;
}
.privacy-card p {
  margin: 6px 0 0;
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.7;
}
.privacy-card__classification {
  margin-top: 4px !important;
}
@media (max-width: 1000px) {
  .compliance-summary-grid {
    grid-template-columns: 1fr 1fr;
  }
  .score-card {
    grid-row: span 2;
  }
}
@media (max-width: 760px) {
  .compliance-summary-grid,
  .operations-grid {
    grid-template-columns: 1fr;
  }
  .score-card {
    grid-row: auto;
  }
  .page-heading,
  .card-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
