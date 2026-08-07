<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { Plus, Refresh, Search, UserFilled } from "@element-plus/icons-vue";

import type {
  CreateUserRequest,
  PageMeta,
  UserListQuery,
  UserRole,
  UserStatus,
  UserRecord,
} from "@admin-x/shared";
import { getErrorMessage } from "@admin-x/shared";

import { usersApi } from "@/api/users";

const loading = ref(false);
const dialogVisible = ref(false);
const formLoading = ref(false);
const tableData = ref<UserRecord[]>([]);
const formRef = ref<FormInstance>();
const query = reactive<UserListQuery>({
  keyword: "",
  page: 1,
  pageSize: 10,
  status: "all",
});
const pageMeta = ref<PageMeta>({
  page: 1,
  pageCount: 1,
  pageSize: 10,
  total: 0,
});
const form = reactive<CreateUserRequest>({
  displayName: "",
  email: "",
  password: "",
  role: "operator",
  status: "invited",
  username: "",
});

const formRules: FormRules<CreateUserRequest> = {
  displayName: [{ message: "请输入姓名", required: true, trigger: "blur" }],
  email: [
    { message: "请输入邮箱", required: true, trigger: "blur" },
    { message: "请输入有效的邮箱地址", type: "email", trigger: "blur" },
  ],
  password: [
    { message: "请输入初始密码", required: true, trigger: "blur" },
    { min: 6, message: "初始密码长度不能少于 6 位", trigger: "blur" },
  ],
  username: [
    { message: "请输入用户名", required: true, trigger: "blur" },
    { min: 3, message: "用户名至少 3 个字符", trigger: "blur" },
  ],
};

function statusLabel(status: UserStatus) {
  return {
    active: "正常",
    invited: "待激活",
    suspended: "已停用",
  }[status];
}

function statusType(status: UserStatus) {
  return {
    active: "success",
    invited: "warning",
    suspended: "info",
  }[status] as "success" | "warning" | "info";
}

function roleLabel(role: UserRole) {
  return {
    admin: "管理员",
    operator: "运营成员",
    "super-admin": "超级管理员",
  }[role];
}

function resetForm() {
  form.displayName = "";
  form.email = "";
  form.password = "";
  form.role = "operator";
  form.status = "invited";
  form.username = "";
}

async function loadUsers() {
  loading.value = true;
  try {
    const result = await usersApi.list({ ...query });
    tableData.value = result.items;
    pageMeta.value = result.meta;
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  void loadUsers();
}

function handleReset() {
  query.keyword = "";
  query.status = "all";
  query.page = 1;
  void loadUsers();
}

function handlePageChange(page: number) {
  query.page = page;
  void loadUsers();
}

function handleSizeChange(pageSize: number) {
  query.pageSize = pageSize;
  query.page = 1;
  void loadUsers();
}

function openCreateDialog() {
  resetForm();
  dialogVisible.value = true;
}

async function handleCreate() {
  if (!formRef.value) {
    return;
  }
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  formLoading.value = true;
  try {
    await usersApi.create(form);
    ElMessage.success("用户创建成功");
    dialogVisible.value = false;
    await loadUsers();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "创建用户失败"));
  } finally {
    formLoading.value = false;
  }
}

async function toggleStatus(row: UserRecord) {
  const nextStatus: UserStatus = row.status === "active" ? "suspended" : "active";
  try {
    await usersApi.updateStatus(row.id, { status: nextStatus });
    ElMessage.success(nextStatus === "active" ? "用户已启用" : "用户已停用");
    await loadUsers();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "更新用户状态失败"));
  }
}

async function removeUser(row: UserRecord) {
  try {
    await ElMessageBox.confirm(
      `确定要删除用户“${row.displayName}”吗？删除后无法恢复。`,
      "删除用户",
      { confirmButtonText: "确认删除", cancelButtonText: "取消", type: "warning" },
    );
    await usersApi.remove(row.id);
    ElMessage.success("用户已删除");
    await loadUsers();
  } catch (error: unknown) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(getErrorMessage(error, "删除用户失败"));
    }
  }
}

void loadUsers();
</script>

<template>
  <div class="users-page">
    <div class="page-heading users-heading">
      <div>
        <p class="page-kicker">MEMBERS</p>
        <h1>用户管理</h1>
        <p class="page-description">管理工作区成员、角色和访问状态。</p>
      </div>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>新增用户
      </el-button>
    </div>

    <el-card class="users-card" shadow="never">
      <div class="users-toolbar">
        <div class="users-toolbar__filters">
          <el-input
            v-model="query.keyword"
            class="keyword-input"
            clearable
            placeholder="搜索姓名、用户名或邮箱"
            @keyup.enter="handleSearch"
          >
            <template #prefix
              ><el-icon><Search /></el-icon
            ></template>
          </el-input>
          <el-select v-model="query.status" class="status-select" placeholder="全部状态">
            <el-option label="全部状态" value="all" />
            <el-option label="正常" value="active" />
            <el-option label="待激活" value="invited" />
            <el-option label="已停用" value="suspended" />
          </el-select>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button text @click="handleReset">
            <el-icon><Refresh /></el-icon>重置
          </el-button>
        </div>
        <span class="users-count">共 {{ pageMeta.total }} 位成员</span>
      </div>

      <el-table v-loading="loading" class="users-table" :data="tableData" row-key="id">
        <el-table-column label="成员" min-width="220">
          <template #default="{ row }">
            <div class="member-cell">
              <el-avatar :size="36" class="member-avatar">{{
                row.displayName.slice(0, 1)
              }}</el-avatar>
              <div>
                <strong>{{ row.displayName }}</strong>
                <span>@{{ row.username }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="邮箱" min-width="210" prop="email" />
        <el-table-column label="角色" min-width="130">
          <template #default="{ row }">{{ roleLabel(row.role) }}</template>
        </el-table-column>
        <el-table-column label="状态" min-width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" effect="light">{{
              statusLabel(row.status)
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近活跃" min-width="150" prop="lastActiveAt" />
        <el-table-column fixed="right" label="操作" width="180">
          <template #default="{ row }">
            <el-button text type="primary" @click="toggleStatus(row)">
              {{ row.status === "active" ? "停用" : "启用" }}
            </el-button>
            <el-button text type="danger" @click="removeUser(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="table-empty">
            <el-icon :size="30"><UserFilled /></el-icon>
            <span>暂无匹配的用户</span>
          </div>
        </template>
      </el-table>

      <div class="users-pagination">
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

    <el-dialog v-model="dialogVisible" title="新增用户" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top">
        <div class="form-grid">
          <el-form-item label="姓名" prop="displayName">
            <el-input v-model="form.displayName" placeholder="例如：张小明" />
          </el-form-item>
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" placeholder="用于登录的账号" />
          </el-form-item>
        </div>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="name@example.com" />
        </el-form-item>
        <el-form-item label="初始密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="至少 6 位，用户可用此密码登录"
          />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="角色" prop="role">
            <el-select v-model="form.role" class="full-width">
              <el-option label="管理员" value="admin" />
              <el-option label="运营成员" value="operator" />
              <el-option label="超级管理员" value="super-admin" />
            </el-select>
          </el-form-item>
          <el-form-item label="初始状态" prop="status">
            <el-select v-model="form.status" class="full-width">
              <el-option label="待激活" value="invited" />
              <el-option label="正常" value="active" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="formLoading" @click="handleCreate">确认创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.users-page {
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

.users-card :deep(.el-card__body) {
  padding: 0;
}

.users-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--ax-line-soft);
}

.users-toolbar__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
}

.keyword-input {
  width: 250px;
}

.status-select {
  width: 130px;
}

.users-toolbar :deep(.el-input__wrapper),
.users-toolbar :deep(.el-select__wrapper) {
  min-height: 34px;
  box-shadow: 0 0 0 1px var(--ax-line) inset;
}

.users-count {
  flex: 0 0 auto;
  color: var(--ax-muted);
  font-size: 11px;
}

.users-table {
  color: var(--ax-content);
}

.users-table :deep(.el-table__header-wrapper th) {
  height: 46px;
  color: var(--ax-muted);
  font-size: 11px;
  font-weight: 600;
  background: var(--ax-surface-muted);
}

.users-table :deep(.el-table__row td) {
  height: 68px;
  color: var(--ax-content);
  font-size: 12px;
  border-bottom-color: var(--ax-line-soft);
}

.users-table :deep(.el-table__row:hover > td) {
  background: var(--ax-primary-soft);
}

.member-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.member-avatar {
  color: var(--ax-primary);
  font-size: 13px;
  font-weight: 700;
  background: var(--ax-primary-soft);
}

.member-cell > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.member-cell strong {
  color: var(--ax-content);
  font-size: 12px;
  font-weight: 600;
}

.member-cell span {
  color: var(--ax-muted);
  font-size: 10px;
}

.users-table :deep(.el-tag) {
  border-radius: 5px;
  font-size: 10px;
}

.users-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  color: var(--ax-muted);
  font-size: 10px;
}

.users-pagination :deep(.el-pagination) {
  --el-pagination-button-height: 27px;
  --el-pagination-button-width: 27px;
}

.users-pagination :deep(.el-pagination .btn-prev),
.users-pagination :deep(.el-pagination .btn-next),
.users-pagination :deep(.el-pagination .el-pager li) {
  border-radius: 6px;
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

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 14px;
}

.full-width {
  width: 100%;
}

@media (max-width: 700px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .users-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .users-toolbar__filters {
    width: 100%;
  }

  .keyword-input {
    width: 100%;
  }

  .users-count {
    margin-top: 4px;
  }

  .users-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 460px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
