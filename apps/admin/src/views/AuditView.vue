<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Download, Refresh, Search, Document } from "@element-plus/icons-vue";

import type { AuditListQuery, AuditRecord, PageMeta } from "@admin-x/shared";
import { getErrorMessage, getRoleDefinition } from "@admin-x/shared";

import { auditApi } from "@/api/audit";

const loading = ref(false);
const tableData = ref<AuditRecord[]>([]);
const query = reactive<AuditListQuery>({ keyword: "", page: 1, pageSize: 10, result: "all" });
const pageMeta = ref<PageMeta>({ page: 1, pageCount: 1, pageSize: 10, total: 0 });
const detailVisible = ref(false);
const selectedRecord = ref<AuditRecord | null>(null);

function formatTime(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value
    : timestamp.toLocaleString("zh-CN", { hour12: false });
}

function roleLabel(role: AuditRecord["actorRole"]) {
  return role ? getRoleDefinition(role).label : "系统";
}

function typeLabel(type: AuditRecord["type"]) {
  return { create: "创建", login: "登录", system: "系统", update: "变更" }[type];
}

function resultLabel(result: AuditRecord["result"]) {
  return { blocked: "已阻断", failure: "失败", success: "成功" }[result];
}

function resultType(result: AuditRecord["result"]) {
  return { blocked: "warning", failure: "danger", success: "success" }[result] as
    | "warning"
    | "danger"
    | "success";
}

function formatJson(value: unknown) {
  return value === undefined ? "—" : JSON.stringify(value, null, 2);
}

async function loadAudits() {
  loading.value = true;
  try {
    const result = await auditApi.list({ ...query });
    tableData.value = result.items;
    pageMeta.value = result.meta;
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "审计记录加载失败"));
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  void loadAudits();
}

function handleReset() {
  query.keyword = "";
  query.result = "all";
  query.page = 1;
  void loadAudits();
}

function showDetail(row: AuditRecord) {
  selectedRecord.value = row;
  detailVisible.value = true;
}

async function handleExport() {
  try {
    const response = await auditApi.export({ ...query });
    const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `admin-x-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    ElMessage.success("审计记录已导出");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "审计记录导出失败"));
  }
}

function handlePageChange(page: number) {
  query.page = page;
  void loadAudits();
}

function handleSizeChange(pageSize: number) {
  query.pageSize = pageSize;
  query.page = 1;
  void loadAudits();
}

void loadAudits();
</script>

<template>
  <div class="audit-page">
    <div class="page-heading">
      <div>
        <h1>安全审计</h1>
        <p class="page-description">只读查看系统关键操作；记录包含账号、时间、IP、结果和前后值。</p>
      </div>
      <div class="audit-heading-actions">
        <el-tag type="info" effect="light">只读审计视图</el-tag>
        <el-button type="primary" plain @click="handleExport">
          <el-icon><Download /></el-icon>导出记录
        </el-button>
      </div>
    </div>

    <el-card class="audit-card" shadow="never">
      <div class="audit-toolbar">
        <div class="audit-toolbar__filters">
          <el-input
            v-model="query.keyword"
            class="keyword-input"
            clearable
            placeholder="搜索操作者、操作或资源"
            @keyup.enter="handleSearch"
          >
            <template #prefix
              ><el-icon><Search /></el-icon
            ></template>
          </el-input>
          <el-select v-model="query.result" class="result-select" placeholder="全部结果">
            <el-option label="全部结果" value="all" />
            <el-option label="成功" value="success" />
            <el-option label="失败" value="failure" />
            <el-option label="已阻断" value="blocked" />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button text @click="handleReset"
            ><el-icon><Refresh /></el-icon>重置</el-button
          >
        </div>
        <span class="audit-count">共 {{ pageMeta.total }} 条记录</span>
      </div>

      <el-table
        v-loading="loading"
        class="audit-table"
        :data="tableData"
        row-key="id"
        @row-click="showDetail"
      >
        <el-table-column label="时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作者" min-width="170">
          <template #default="{ row }">
            <strong>{{ row.actorName }}</strong>
            <small v-if="row.actorUsername">@{{ row.actorUsername }}</small>
          </template>
        </el-table-column>
        <el-table-column label="角色" min-width="130">
          <template #default="{ row }">{{ roleLabel(row.actorRole) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }"
            ><el-tag size="small" effect="plain">{{ typeLabel(row.type) }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="resultType(row.result)" effect="plain">
              {{ resultLabel(row.result) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="180" prop="title" />
        <el-table-column label="资源" min-width="120" prop="resource" />
        <el-table-column label="来源 IP" min-width="135" prop="ipAddress" />
        <el-table-column label="详情" min-width="300" prop="description" />
        <template #empty>
          <div class="table-empty">
            <el-icon :size="30"><Document /></el-icon>
            <span>暂无审计记录</span>
          </div>
        </template>
      </el-table>

      <div class="audit-pagination">
        <span
          >显示第 {{ tableData.length ? (pageMeta.page - 1) * pageMeta.pageSize + 1 : 0 }} -
          {{ Math.min(pageMeta.page * pageMeta.pageSize, pageMeta.total) }} 条</span
        >
        <el-pagination
          background
          layout="prev, pager, next, sizes"
          :current-page="pageMeta.page"
          :page-size="pageMeta.pageSize"
          :page-sizes="[10, 20, 50]"
          :total="pageMeta.total"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailVisible" title="审计记录详情" width="min(760px, calc(100vw - 32px))">
      <div v-if="selectedRecord" class="audit-detail">
        <div class="audit-detail__grid">
          <span
            >记录时间<strong>{{ formatTime(selectedRecord.createdAt) }}</strong></span
          >
          <span
            >操作者<strong
              >{{ selectedRecord.actorName }} @{{ selectedRecord.actorUsername || "—" }}</strong
            ></span
          >
          <span
            >来源 IP<strong>{{ selectedRecord.ipAddress || "—" }}</strong></span
          >
          <span
            >请求号<strong>{{ selectedRecord.requestId || "—" }}</strong></span
          >
          <span
            >资源<strong
              >{{ selectedRecord.resource }} / {{ selectedRecord.targetId || "—" }}</strong
            ></span
          >
          <span
            >完整性哈希<strong>{{ selectedRecord.integrityHash || "历史记录未回填" }}</strong></span
          >
        </div>
        <div class="audit-detail__values">
          <div>
            <small>修改前</small>
            <pre>{{ formatJson(selectedRecord.before) }}</pre>
          </div>
          <div>
            <small>修改后</small>
            <pre>{{ formatJson(selectedRecord.after) }}</pre>
          </div>
        </div>
        <p class="audit-detail__description">{{ selectedRecord.description }}</p>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.audit-page {
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

.page-heading h1 {
  margin: 0;
  color: var(--ax-heading);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.page-description {
  margin: 8px 0 0;
  color: var(--ax-muted);
  font-size: 12px;
}
.audit-heading-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.audit-card :deep(.el-card__body) {
  padding: 0;
}

.audit-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--ax-line-soft);
}

.audit-toolbar__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
}

.keyword-input {
  width: 280px;
}

.result-select {
  width: 120px;
}

.audit-count,
.audit-pagination {
  color: var(--ax-muted);
  font-size: 11px;
}

.audit-table {
  color: var(--ax-content);
}

.audit-table :deep(.el-table__header-wrapper th) {
  color: var(--ax-muted);
  background: var(--ax-surface-muted);
}

.audit-table :deep(.el-table__row td) {
  color: var(--ax-content);
  border-bottom-color: var(--ax-line-soft);
}

.audit-table :deep(.el-table__row) {
  cursor: pointer;
}

.audit-table strong,
.audit-table small {
  display: block;
}

.audit-table small {
  margin-top: 3px;
  color: var(--ax-muted);
  font-size: 10px;
}

.audit-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
}

.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 45px 0;
  color: var(--ax-muted);
  font-size: 12px;
}

.audit-detail__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--ax-line-soft);
}

.audit-detail__grid span,
.audit-detail__grid strong {
  display: block;
}

.audit-detail__grid span {
  color: var(--ax-muted);
  font-size: 11px;
}

.audit-detail__grid strong {
  margin-top: 5px;
  overflow: hidden;
  color: var(--ax-heading);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-detail__values {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 18px;
}

.audit-detail__values small {
  color: var(--ax-muted);
  font-size: 11px;
}

.audit-detail__values pre {
  min-height: 90px;
  margin: 7px 0 0;
  padding: 12px;
  overflow: auto;
  border-radius: 8px;
  color: var(--ax-content);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  background: var(--ax-surface-muted);
}

.audit-detail__description {
  margin: 18px 0 0;
  color: var(--ax-content);
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 700px) {
  .page-heading,
  .audit-toolbar,
  .audit-pagination {
    align-items: flex-start;
    flex-direction: column;
  }

  .keyword-input {
    width: 100%;
  }

  .result-select {
    width: 100%;
  }

  .audit-heading-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .audit-detail__grid,
  .audit-detail__values {
    grid-template-columns: 1fr;
  }
}
</style>
