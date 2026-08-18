<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Refresh, Search, Document } from "@element-plus/icons-vue";

import type { AuditListQuery, AuditRecord, PageMeta } from "@admin-x/shared";
import { getErrorMessage, getRoleDefinition } from "@admin-x/shared";

import { auditApi } from "@/api/audit";

const loading = ref(false);
const tableData = ref<AuditRecord[]>([]);
const query = reactive<AuditListQuery>({ keyword: "", page: 1, pageSize: 10 });
const pageMeta = ref<PageMeta>({ page: 1, pageCount: 1, pageSize: 10, total: 0 });

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
  query.page = 1;
  void loadAudits();
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
        <p class="page-kicker">SECURITY AUDIT</p>
        <h1>安全审计</h1>
        <p class="page-description">只读查看系统关键操作，审计管理员不能修改或删除记录。</p>
      </div>
      <el-tag type="info" effect="light">只读审计视图</el-tag>
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
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button text @click="handleReset"
            ><el-icon><Refresh /></el-icon>重置</el-button
          >
        </div>
        <span class="audit-count">共 {{ pageMeta.total }} 条记录</span>
      </div>

      <el-table v-loading="loading" class="audit-table" :data="tableData" row-key="id">
        <el-table-column label="时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作者" min-width="150" prop="actorName" />
        <el-table-column label="角色" min-width="130">
          <template #default="{ row }">{{ roleLabel(row.actorRole) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }"
            ><el-tag size="small" effect="plain">{{ typeLabel(row.type) }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="操作" min-width="180" prop="title" />
        <el-table-column label="资源" min-width="120" prop="resource" />
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
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.page-description {
  margin: 8px 0 0;
  color: var(--ax-muted);
  font-size: 12px;
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
}
</style>
