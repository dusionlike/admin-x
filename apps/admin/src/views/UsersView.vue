<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { Plus, Refresh, Search, UserFilled } from "@element-plus/icons-vue";

import type {
  CreateUserRequest,
  DataScopeType,
  PageMeta,
  UserListQuery,
  UserRole,
  UserStatus,
  UserRecord,
} from "@admin-x/shared";
import {
  getAccountPasswordPolicyError,
  getErrorMessage,
  getRoleDefinition,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION,
  ROLE_DEFINITIONS,
} from "@admin-x/shared";

import { usersApi } from "@/api/users";
import { useAuthStore } from "@/stores/auth";

type ResetPasswordForm = { confirmPassword: string; newPassword: string };

const authStore = useAuthStore();
const loading = ref(false);
const dialogVisible = ref(false);
const roleDialogVisible = ref(false);
const scopeDialogVisible = ref(false);
const resetPasswordDialogVisible = ref(false);
const formLoading = ref(false);
const roleFormLoading = ref(false);
const scopeFormLoading = ref(false);
const resetPasswordLoading = ref(false);
const tableData = ref<UserRecord[]>([]);
const formRef = ref<FormInstance>();
const resetPasswordFormRef = ref<FormInstance>();
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
  privacyNoticeAccepted: false,
  role: "operator",
  status: "invited",
  username: "",
});
const roleForm = reactive<{ displayName: string; id: string; role: UserRole }>({
  displayName: "",
  id: "",
  role: "operator",
});
const scopeForm = reactive<{
  displayName: string;
  id: string;
  ids: string;
  type: DataScopeType;
}>({
  displayName: "",
  id: "",
  ids: "",
  type: "assigned",
});
const resetPasswordTarget = reactive({ displayName: "", id: "" });
const resetPasswordForm = reactive<ResetPasswordForm>({
  confirmPassword: "",
  newPassword: "",
});
const canCreateUsers = computed(() => authStore.can("user:create"));
const canManageStatus = computed(() => authStore.can("user:status"));
const canDeleteUsers = computed(() => authStore.can("user:delete"));
const hasActiveSecurityAdmin = computed(() =>
  tableData.value.some((user) => user.role === "security-admin" && user.status === "active"),
);
const canBootstrapSecurityAdmin = computed(
  () => authStore.user?.role === "system-admin" && !hasActiveSecurityAdmin.value,
);
const canAssignRoles = computed(
  () => authStore.can("role:assign") || canBootstrapSecurityAdmin.value,
);
const canManageDataScope = computed(() => authStore.can("security:manage"));
const availableRoleDefinitions = computed(() => {
  if (canBootstrapSecurityAdmin.value) {
    return ROLE_DEFINITIONS.filter((definition) => definition.code === "security-admin");
  }
  return authStore.can("role:assign") ? ROLE_DEFINITIONS : [];
});

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
    if (
      error === "cancel" ||
      error === "close" ||
      (typeof error === "object" &&
        error !== null &&
        "action" in error &&
        ((error as { action?: string }).action === "cancel" ||
          (error as { action?: string }).action === "close"))
    ) {
      return false;
    }
    throw error;
  }
}

const formRules: FormRules<CreateUserRequest> = {
  displayName: [{ message: "请输入姓名", required: true, trigger: "blur" }],
  email: [
    { message: "请输入邮箱", required: true, trigger: "blur" },
    { message: "请输入有效的邮箱地址", type: "email", trigger: "blur" },
  ],
  password: [
    { message: "请输入初始密码", required: true, trigger: "blur" },
    {
      trigger: "blur",
      validator: (_rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        const error = getAccountPasswordPolicyError(String(value), {
          role: form.role,
          username: form.username,
        });
        callback(error ? new Error(error) : undefined);
      },
    },
  ],
  privacyNoticeAccepted: [
    {
      trigger: "change",
      validator: (_rule, value, callback) =>
        value === true ? callback() : callback(new Error("请先确认个人信息保护告知")),
    },
  ],
  username: [
    { message: "请输入用户名", required: true, trigger: "blur" },
    { min: 3, message: "用户名至少 3 个字符", trigger: "blur" },
  ],
};

const resetPasswordRules: FormRules<ResetPasswordForm> = {
  confirmPassword: [
    { message: "请再次输入新密码", required: true, trigger: "blur" },
    {
      trigger: "blur",
      validator: (_rule, value, callback) => {
        callback(
          value === resetPasswordForm.newPassword ? undefined : new Error("两次输入的密码不一致"),
        );
      },
    },
  ],
  newPassword: [
    { message: "请输入新密码", required: true, trigger: "blur" },
    {
      trigger: "blur",
      validator: (_rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        const error = getAccountPasswordPolicyError(String(value), {
          username: tableData.value.find((user) => user.id === resetPasswordTarget.id)?.username,
          role: tableData.value.find((user) => user.id === resetPasswordTarget.id)?.role,
        });
        callback(error ? new Error(error) : undefined);
      },
    },
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
  return getRoleDefinition(role).label;
}

function dataScopeLabel(type: DataScopeType) {
  return {
    all: "全部数据",
    assigned: "指定数据",
    department: "本部门",
    organization: "本单位",
    project: "指定项目",
    self: "本人数据",
  }[type];
}

function resetForm() {
  form.displayName = "";
  form.email = "";
  form.password = "";
  form.privacyNoticeAccepted = false;
  form.role = "operator";
  form.status = "invited";
  form.username = "";
}

function handleInitialRoleChange(role: UserRole) {
  if (role === "security-admin") {
    form.status = "active";
  }
}

function openRoleDialog(row: UserRecord) {
  roleForm.displayName = row.displayName;
  roleForm.id = row.id;
  roleForm.role = canBootstrapSecurityAdmin.value ? "security-admin" : row.role;
  roleDialogVisible.value = true;
}

function openScopeDialog(row: UserRecord) {
  scopeForm.displayName = row.displayName;
  scopeForm.id = row.id;
  scopeForm.ids = row.dataScope.ids.join("\n");
  scopeForm.type = row.dataScope.type;
  scopeDialogVisible.value = true;
}

async function handleScopeUpdate() {
  if (!(await confirmSensitiveAction())) {
    return;
  }
  scopeFormLoading.value = true;
  try {
    const updated = await usersApi.updateDataScope(scopeForm.id, {
      dataScope: {
        ids: scopeForm.ids
          .split(/\r?\n|,/u)
          .map((value) => value.trim())
          .filter(Boolean),
        type: scopeForm.type,
      },
    });
    const index = tableData.value.findIndex((user) => user.id === updated.id);
    if (index >= 0) tableData.value[index] = updated;
    ElMessage.success("数据权限范围已更新");
    scopeDialogVisible.value = false;
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "更新数据权限失败"));
  } finally {
    scopeFormLoading.value = false;
  }
}

async function handleRoleUpdate() {
  if (!(await confirmSensitiveAction())) {
    return;
  }
  roleFormLoading.value = true;
  try {
    await usersApi.updateRole(roleForm.id, { role: roleForm.role });
    ElMessage.success("用户角色已更新");
    roleDialogVisible.value = false;
    await loadUsers();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "更新用户角色失败"));
  } finally {
    roleFormLoading.value = false;
  }
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
  if (!(await confirmSensitiveAction())) {
    return;
  }

  formLoading.value = true;
  try {
    await usersApi.create(form);
    ElMessage.success("成员创建成功");
    dialogVisible.value = false;
    await loadUsers();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "创建成员失败"));
  } finally {
    formLoading.value = false;
  }
}

async function toggleStatus(row: UserRecord) {
  const nextStatus: UserStatus = row.status === "active" ? "suspended" : "active";
  try {
    if (nextStatus === "suspended") {
      await ElMessageBox.confirm(
        `确定停用“${row.displayName}”吗？停用后该账号将无法登录管理后台。`,
        "停用账号",
        { confirmButtonText: "确认停用", cancelButtonText: "取消", type: "warning" },
      );
    }
    if (!(await confirmSensitiveAction())) {
      return;
    }
    await usersApi.updateStatus(row.id, { status: nextStatus });
    ElMessage.success(nextStatus === "active" ? "成员已启用" : "成员已停用");
    await loadUsers();
  } catch (error: unknown) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(getErrorMessage(error, "更新成员状态失败"));
    }
  }
}

async function unlockUser(row: UserRecord) {
  try {
    if (!(await confirmSensitiveAction())) {
      return;
    }
    await usersApi.unlock(row.id);
    ElMessage.success("账号登录锁定已解除");
    await loadUsers();
  } catch (error: unknown) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(getErrorMessage(error, "解除账号锁定失败"));
    }
  }
}

function openResetPasswordDialog(row: UserRecord) {
  resetPasswordTarget.displayName = row.displayName;
  resetPasswordTarget.id = row.id;
  resetPasswordForm.newPassword = "";
  resetPasswordForm.confirmPassword = "";
  resetPasswordDialogVisible.value = true;
}

async function handleResetPassword() {
  const valid = await resetPasswordFormRef.value?.validate().catch(() => false);
  if (!valid || !(await confirmSensitiveAction())) {
    return;
  }
  resetPasswordLoading.value = true;
  try {
    await usersApi.resetPassword(resetPasswordTarget.id, {
      newPassword: resetPasswordForm.newPassword,
    });
    resetPasswordDialogVisible.value = false;
    ElMessage.success(`已重置 ${resetPasswordTarget.displayName} 的登录密码`);
    await loadUsers();
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "重置用户密码失败"));
  } finally {
    resetPasswordForm.newPassword = "";
    resetPasswordForm.confirmPassword = "";
    resetPasswordLoading.value = false;
  }
}

async function removeUser(row: UserRecord) {
  try {
    await ElMessageBox.confirm(
      `确定要删除成员“${row.displayName}”吗？删除后无法恢复。`,
      "删除成员",
      { confirmButtonText: "确认删除", cancelButtonText: "取消", type: "warning" },
    );
    if (!(await confirmSensitiveAction())) {
      return;
    }
    await usersApi.remove(row.id);
    ElMessage.success("成员已删除");
    await loadUsers();
  } catch (error: unknown) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(getErrorMessage(error, "删除成员失败"));
    }
  }
}

void loadUsers();
</script>

<template>
  <div class="users-page">
    <div class="page-heading users-heading">
      <div>
        <p class="page-kicker">USERS</p>
        <h1>用户管理</h1>
        <p class="page-description">管理工作区成员、角色和访问状态。</p>
      </div>
      <el-button v-if="canCreateUsers" type="primary" @click="openCreateDialog">
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
        <span class="users-count">共 {{ pageMeta.total }} 位用户</span>
      </div>

      <el-table v-loading="loading" class="users-table" :data="tableData" row-key="id">
        <el-table-column label="成员" min-width="220">
          <template #default="{ row }">
            <div class="member-cell">
              <el-avatar :size="36" class="member-avatar">{{
                row.displayName.slice(0, 1)
              }}</el-avatar>
              <strong>{{ row.displayName }}</strong>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="用户名" min-width="150" prop="username" />
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
        <el-table-column label="数据范围" min-width="125">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ dataScopeLabel(row.dataScope.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="MFA" width="80">
          <template #default="{ row }">
            <el-tag :type="row.mfaEnabled ? 'success' : 'info'" size="small" effect="plain">
              {{ row.mfaEnabled ? "已绑定" : "未绑定" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近活跃" min-width="150" prop="lastActiveAt" />
        <el-table-column
          v-if="canManageStatus || canDeleteUsers || canAssignRoles || canManageDataScope"
          fixed="right"
          label="操作"
          width="420"
        >
          <template #default="{ row }">
            <div class="user-actions">
              <el-button v-if="canManageStatus" text type="primary" @click="toggleStatus(row)">
                {{ row.status === "active" ? "停用" : "启用" }}
              </el-button>
              <el-button v-if="canManageStatus" text type="warning" @click="unlockUser(row)">
                解锁
              </el-button>
              <el-button
                v-if="canManageStatus"
                text
                type="warning"
                @click="openResetPasswordDialog(row)"
              >
                重置密码
              </el-button>
              <el-button v-if="canAssignRoles" text type="primary" @click="openRoleDialog(row)">
                分配角色
              </el-button>
              <el-button
                v-if="canManageDataScope"
                text
                type="primary"
                @click="openScopeDialog(row)"
              >
                数据范围
              </el-button>
              <el-button v-if="canDeleteUsers" text type="danger" @click="removeUser(row)">
                删除
              </el-button>
            </div>
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
            autocomplete="off"
            placeholder="至少 8 位，需满足四类字符要求"
          />
        </el-form-item>
        <p class="password-policy-hint">
          {{
            form.role === "security-admin"
              ? "首位安全管理员密码至少 12 位，并同时包含数字、大写字母、小写字母和特殊字符。"
              : "普通成员密码至少 8 位，并同时包含数字、大写字母、小写字母和特殊字符。"
          }}
        </p>
        <el-form-item prop="privacyNoticeAccepted">
          <el-checkbox v-model="form.privacyNoticeAccepted">
            已告知该成员采集目的，并确认个人信息保护告知（{{ PRIVACY_NOTICE_VERSION }}）。{{
              PRIVACY_NOTICE_SUMMARY
            }}
          </el-checkbox>
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="初始角色">
            <el-select
              v-if="canBootstrapSecurityAdmin"
              v-model="form.role"
              class="full-width"
              @change="handleInitialRoleChange"
            >
              <el-option label="普通业务用户" value="operator" />
              <el-option label="查询/只读用户" value="readonly" />
              <el-option label="安全管理员（首次初始化）" value="security-admin" />
            </el-select>
            <div v-else class="role-init-copy">
              <el-tag type="info" effect="plain">普通用户</el-tag>
              <span>账号创建后由安全管理员分配管理角色。</span>
            </div>
          </el-form-item>
          <el-form-item label="初始状态" prop="status">
            <el-select
              v-model="form.status"
              class="full-width"
              :disabled="form.role === 'security-admin'"
            >
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

    <el-dialog v-model="roleDialogVisible" title="分配用户角色" width="440px" destroy-on-close>
      <p class="role-dialog-copy">
        正在调整「{{ roleForm.displayName }}」的角色。
        {{
          canBootstrapSecurityAdmin
            ? "首次初始化只能指定安全管理员。"
            : "角色分配属于安全授权操作，完成后会写入审计记录。"
        }}
      </p>
      <el-form label-position="top">
        <el-form-item label="角色">
          <el-select v-model="roleForm.role" class="full-width">
            <el-option
              v-for="definition in availableRoleDefinitions"
              :key="definition.code"
              :label="definition.label"
              :value="definition.code"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="roleFormLoading" @click="handleRoleUpdate">
          保存角色
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="resetPasswordDialogVisible"
      title="重置用户密码"
      width="440px"
      destroy-on-close
    >
      <p class="role-dialog-copy">
        将为「{{
          resetPasswordTarget.displayName
        }}」设置新密码，操作完成后该账号的旧会话会立即失效。
      </p>
      <el-form
        ref="resetPasswordFormRef"
        :model="resetPasswordForm"
        :rules="resetPasswordRules"
        label-position="top"
      >
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="resetPasswordForm.newPassword"
            type="password"
            show-password
            autocomplete="off"
            placeholder="需满足账号对应的四类字符要求"
          />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input
            v-model="resetPasswordForm.confirmPassword"
            type="password"
            show-password
            autocomplete="off"
            placeholder="请再次输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPasswordDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetPasswordLoading" @click="handleResetPassword">
          确认重置
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="scopeDialogVisible" title="配置数据权限范围" width="480px" destroy-on-close>
      <p class="role-dialog-copy">
        正在调整「{{
          scopeForm.displayName
        }}」的数据范围。范围由后端接口执行过滤，保存后会使该账号的旧会话失效。
      </p>
      <el-form label-position="top">
        <el-form-item label="数据范围">
          <el-select v-model="scopeForm.type" class="full-width">
            <el-option
              v-for="(label, value) in {
                all: '全部数据',
                organization: '本单位',
                department: '本部门',
                project: '指定项目',
                assigned: '指定数据',
                self: '本人数据',
              }"
              :key="value"
              :label="label"
              :value="value"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="!['all', 'self'].includes(scopeForm.type)"
          label="范围编号（每行一个，也可用逗号分隔）"
        >
          <el-input
            v-model="scopeForm.ids"
            type="textarea"
            :rows="4"
            placeholder="例如：广东省&#10;广州项目-01"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scopeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="scopeFormLoading" @click="handleScopeUpdate">
          保存范围
        </el-button>
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
  white-space: nowrap;
}

.member-avatar {
  color: var(--ax-primary);
  font-size: 13px;
  font-weight: 700;
  background: var(--ax-primary-soft);
}

.member-cell strong {
  color: var(--ax-content);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.user-actions {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 12px;
  white-space: nowrap;
}

.user-actions :deep(.el-button) {
  margin: 0;
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

.password-policy-hint {
  margin: -8px 0 18px;
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.6;
}

.full-width {
  width: 100%;
}

.role-init-copy {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.5;
}

.role-dialog-copy {
  margin: 0 0 18px;
  color: var(--ax-muted);
  font-size: 12px;
  line-height: 1.7;
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
