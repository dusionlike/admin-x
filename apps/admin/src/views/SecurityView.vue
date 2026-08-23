<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";

import {
  getErrorMessage,
  ROLE_DEFINITIONS,
  type DataScopeType,
  type Permission,
  type SecurityPolicy,
} from "@admin-x/shared";

import { securityApi } from "@/api/security";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const permissionLabels: Record<Permission, string> = {
  "analytics:view": "查看分析",
  "audit:export": "导出审计",
  "audit:read": "查看审计",
  "business:manage": "管理业务",
  "business:operate": "执行业务操作",
  "business:read": "查询业务数据",
  "backup:manage": "管理备份",
  "compliance:manage": "维护合规证据",
  "compliance:read": "查看合规状态",
  "dashboard:view": "查看工作台",
  "role:assign": "分配角色",
  "security:manage": "管理安全策略",
  "system:manage": "管理系统运行",
  "user:create": "创建账号",
  "user:delete": "删除账号",
  "user:read": "查看账号",
  "user:status": "启停账号",
};

const dataScopeLabels: Record<DataScopeType, string> = {
  all: "全部数据",
  assigned: "指定数据",
  department: "本部门",
  organization: "本单位",
  project: "指定项目",
  self: "本人数据",
};

const policyLoading = ref(false);
const policySaving = ref(false);
const ipRangeText = ref("");
const policy = reactive<SecurityPolicy>({
  allowedIpRanges: [],
  concurrentSessionLimit: 1,
  lockoutMinutes: 30,
  loginFailureLimit: 5,
  mfaRequiredForAdministrators: false,
  passwordMaxAgeDays: 90,
  passwordMinLength: 8,
  sensitiveActionReauth: true,
  sessionTimeoutMinutes: 30,
});

function permissionLabel(permission: Permission) {
  return permissionLabels[permission];
}

function dataScopeLabel(scope: DataScopeType) {
  return dataScopeLabels[scope];
}

function applyPolicy(value: SecurityPolicy) {
  Object.assign(policy, value);
  ipRangeText.value = value.allowedIpRanges.join("\n");
}

async function confirmSensitiveAction() {
  try {
    const result = await ElMessageBox.prompt(
      "请输入当前登录密码，以确认修改安全策略。验证令牌仅在当前页面短时有效。",
      "敏感操作二次验证",
      {
        confirmButtonText: "验证并保存",
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

async function loadPolicy() {
  policyLoading.value = true;
  try {
    applyPolicy(await securityApi.getPolicy());
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "安全策略加载失败"));
  } finally {
    policyLoading.value = false;
  }
}

async function savePolicy() {
  policySaving.value = true;
  try {
    if (!(await confirmSensitiveAction())) {
      return;
    }
    applyPolicy(
      await securityApi.updatePolicy({
        ...policy,
        allowedIpRanges: ipRangeText.value
          .split(/\r?\n|,/u)
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    );
    ElMessage.success("安全策略已保存，变更已写入审计记录");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "安全策略保存失败"));
  } finally {
    policySaving.value = false;
  }
}

onMounted(() => {
  void loadPolicy();
});
</script>

<template>
  <div class="security-page">
    <div class="page-heading">
      <div>
        <p class="page-kicker">SECURITY POLICY</p>
        <h1>安全策略</h1>
        <p class="page-description">按最小权限、职责分离和强认证原则管理后台安全边界。</p>
      </div>
      <el-tag type="success" effect="light">三员分立已启用</el-tag>
    </div>

    <div class="principle-grid">
      <el-card shadow="never">
        <span class="principle-index">01</span>
        <strong>职责分离</strong>
        <p>系统运行、安全策略、审计监督和业务操作分别由不同岗位负责。</p>
      </el-card>
      <el-card shadow="never">
        <span class="principle-index">02</span>
        <strong>最小权限</strong>
        <p>API 在服务端按角色、操作和数据范围再次鉴权，前端隐藏不作为安全边界。</p>
      </el-card>
      <el-card shadow="never">
        <span class="principle-index">03</span>
        <strong>全程留痕</strong>
        <p>账号、角色、状态、策略和密码等关键操作写入不可修改、不可删除的审计记录。</p>
      </el-card>
    </div>

    <el-card class="policy-card" shadow="never" v-loading="policyLoading">
      <template #header>
        <div class="card-heading">
          <div>
            <strong>登录与访问控制策略</strong>
            <span>策略由安全管理员维护，修改后立即作用于新登录和后续请求。</span>
          </div>
          <el-button type="primary" :loading="policySaving" @click="savePolicy">保存策略</el-button>
        </div>
      </template>
      <el-form class="policy-form" label-position="top">
        <div class="policy-form__grid">
          <el-form-item label="密码最小长度">
            <el-input-number v-model="policy.passwordMinLength" :min="8" :max="64" />
          </el-form-item>
          <el-form-item label="密码有效期（天，0 表示不启用）">
            <el-input-number v-model="policy.passwordMaxAgeDays" :min="0" :max="3650" />
          </el-form-item>
          <el-form-item label="失败锁定阈值">
            <el-input-number v-model="policy.loginFailureLimit" :min="3" :max="20" />
          </el-form-item>
          <el-form-item label="锁定时长（分钟）">
            <el-input-number v-model="policy.lockoutMinutes" :min="30" :max="1440" />
          </el-form-item>
          <el-form-item label="会话超时（分钟）">
            <el-input-number v-model="policy.sessionTimeoutMinutes" :min="5" :max="480" />
          </el-form-item>
          <el-form-item label="同账号并发会话上限">
            <el-input-number v-model="policy.concurrentSessionLimit" :min="1" :max="10" />
          </el-form-item>
        </div>
        <div class="policy-form__switches">
          <el-form-item label="管理员强制 MFA">
            <el-switch v-model="policy.mfaRequiredForAdministrators" />
            <small>启用前必须先为所有有效管理员完成绑定。</small>
          </el-form-item>
          <el-form-item label="敏感操作二次验证">
            <el-switch v-model="policy.sensitiveActionReauth" />
            <small>角色、数据范围、策略等变更应结合当前密码或 MFA 再确认。</small>
          </el-form-item>
        </div>
        <el-form-item label="允许登录来源 IP（每行一个，支持 IPv4/CIDR；留空表示不限制）">
          <el-input
            v-model="ipRangeText"
            type="textarea"
            :rows="3"
            placeholder="例如：10.0.0.0/8&#10;192.168.1.25"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="role-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <strong>角色权限矩阵</strong>
            <span>三员分立与业务岗位分离；每个账号只绑定一个岗位角色。</span>
          </div>
          <el-tag type="warning" effect="plain">权限变更由安全管理员负责</el-tag>
        </div>
      </template>
      <el-table :data="ROLE_DEFINITIONS" row-key="code">
        <el-table-column label="角色" min-width="145">
          <template #default="{ row }">
            <div class="role-cell">
              <strong>{{ row.label }}</strong>
              <small>{{ row.code }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="职责范围" min-width="250" prop="responsibilities" />
        <el-table-column label="默认数据范围" min-width="120">
          <template #default="{ row }">{{ dataScopeLabel(row.defaultDataScope) }}</template>
        </el-table-column>
        <el-table-column label="权限" min-width="320">
          <template #default="{ row }">
            <div class="permission-tags">
              <el-tag
                v-for="permission in row.permissions"
                :key="permission"
                size="small"
                effect="plain"
              >
                {{ permissionLabel(permission) }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="设计说明" min-width="320" prop="description" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.security-page {
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

.principle-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

.principle-grid :deep(.el-card__body) {
  min-height: 130px;
  padding: 20px;
}

.principle-index {
  display: block;
  margin-bottom: 14px;
  color: var(--ax-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.principle-grid strong {
  display: block;
  color: var(--ax-heading);
  font-size: 14px;
}

.principle-grid p,
.policy-form small {
  margin: 8px 0 0;
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.7;
}

.policy-card,
.role-card {
  margin-bottom: 16px;
}

.policy-form {
  padding-top: 2px;
}

.policy-form__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 0 18px;
}

.policy-form__grid :deep(.el-input-number) {
  width: 100%;
}

.policy-form__switches {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}

.policy-form small {
  display: block;
  margin-top: 6px;
}

.role-card :deep(.el-card__body) {
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

.role-card :deep(.el-table__header-wrapper th) {
  color: var(--ax-muted);
  background: var(--ax-surface-muted);
}

.role-card :deep(.el-table__row td) {
  color: var(--ax-content);
  border-bottom-color: var(--ax-line-soft);
}

.role-cell strong,
.role-cell small {
  display: block;
}

.role-cell strong {
  color: var(--ax-heading);
  font-size: 12px;
}

.role-cell small {
  margin-top: 4px;
  color: var(--ax-muted);
  font-size: 10px;
}

.permission-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

@media (max-width: 900px) {
  .policy-form__grid {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }
}

@media (max-width: 800px) {
  .principle-grid,
  .policy-form__switches {
    grid-template-columns: 1fr;
  }

  .page-heading,
  .card-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 520px) {
  .policy-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
