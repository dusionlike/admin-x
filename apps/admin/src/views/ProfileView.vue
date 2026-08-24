<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { ArrowRight, Camera, Lock, Message, Setting, UserFilled } from "@element-plus/icons-vue";

import type {
  MfaSetupResponse,
  MfaStatus,
  PasswordStatus,
  UpdatePasswordRequest,
  UpdateProfileRequest,
  UserRole,
} from "@admin-x/shared";
import {
  getAccountPasswordPolicyError,
  getErrorMessage,
  getRoleDefinition,
  PRIVACY_NOTICE_SUMMARY,
  PRIVACY_NOTICE_VERSION,
} from "@admin-x/shared";

import { usersApi } from "@/api/users";
import { authApi } from "@/api/auth";
import AvatarCropDialog from "@/components/AvatarCropDialog.vue";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const router = useRouter();
const profile = computed(() => authStore.user);
const initials = computed(() => profile.value?.displayName.slice(0, 1) ?? "A");
const roleName = computed(() => roleLabel(profile.value?.role));
const lastLoginLabel = computed(() => formatDate(profile.value?.lastLoginAt));
const editVisible = ref(false);
const cropVisible = ref(false);
const cropSource = ref("");
const saving = ref(false);
const passwordSaving = ref(false);
const privacyConsentSaving = ref(false);
const passwordVisible = ref(false);
const mfaVisible = ref(false);
const mfaLoading = ref(false);
const mfaEnabling = ref(false);
const mfaPassword = ref("");
const mfaCode = ref("");
const mfaSetup = ref<MfaSetupResponse | null>(null);
const mfaStatus = ref<MfaStatus>({ configured: false, enabled: false });
const passwordStatus = ref<PasswordStatus | null>(null);
const avatarInput = ref<HTMLInputElement>();
const formRef = ref<FormInstance>();
const passwordFormRef = ref<FormInstance>();
const editForm = reactive<UpdateProfileRequest>({
  avatar: "",
  displayName: "",
  email: "",
  remark: "",
});
const rules: FormRules<UpdateProfileRequest> = {
  displayName: [
    { required: true, message: "请输入显示名称", trigger: "blur" },
    { max: 50, message: "显示名称不能超过 50 个字符", trigger: "blur" },
  ],
  email: [
    { required: true, message: "请输入邮箱地址", trigger: "blur" },
    { type: "email", message: "请输入有效的邮箱地址", trigger: "blur" },
  ],
};
const passwordForm = reactive<UpdatePasswordRequest & { confirmPassword: string }>({
  confirmPassword: "",
  currentPassword: "",
  newPassword: "",
});
const passwordRules: FormRules<typeof passwordForm> = {
  currentPassword: [{ required: true, message: "请输入当前密码", trigger: "blur" }],
  newPassword: [
    { required: true, message: "请输入新密码", trigger: "blur" },
    {
      trigger: "blur",
      validator: (_rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        const error = getAccountPasswordPolicyError(String(value), {
          role: profile.value?.role,
          username: profile.value?.username,
        });
        callback(error ? new Error(error) : undefined);
      },
    },
  ],
  confirmPassword: [
    { required: true, message: "请再次输入新密码", trigger: "blur" },
    {
      validator: (_rule, value, callback) => {
        callback(
          value === passwordForm.newPassword ? undefined : new Error("两次输入的密码不一致"),
        );
      },
      trigger: "blur",
    },
  ],
};

function roleLabel(role?: UserRole) {
  return getRoleDefinition(role ?? "operator").label;
}

function formatDate(value?: string) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function openPasswordDialog() {
  passwordForm.currentPassword = "";
  passwordForm.newPassword = "";
  passwordForm.confirmPassword = "";
  passwordVisible.value = true;
}

function openEdit() {
  editForm.avatar = profile.value?.avatar ?? "";
  editForm.displayName = profile.value?.displayName ?? "";
  editForm.email = profile.value?.email ?? "";
  editForm.remark = profile.value?.remark ?? "";
  editVisible.value = true;
}

async function loadMfaStatus() {
  try {
    mfaStatus.value = await authApi.mfaStatus();
  } catch {
    // The account page remains usable if an older API does not expose MFA yet.
  }
}

async function loadPasswordStatus() {
  try {
    passwordStatus.value = await usersApi.passwordStatus();
  } catch {
    // The account page remains usable if an older API does not expose password status yet.
  }
}

function openMfaDialog() {
  mfaPassword.value = "";
  mfaCode.value = "";
  mfaSetup.value = null;
  mfaVisible.value = true;
}

async function beginMfaSetup() {
  if (!mfaPassword.value) {
    ElMessage.warning("请输入当前密码");
    return;
  }
  mfaLoading.value = true;
  try {
    mfaSetup.value = await authApi.setupMfa(mfaPassword.value);
    ElMessage.success("MFA 密钥已生成，请用认证器扫描或手动录入");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "MFA 配置生成失败"));
  } finally {
    mfaPassword.value = "";
    mfaLoading.value = false;
  }
}

async function enableMfa() {
  if (!mfaSetup.value || !/^\d{6}$/.test(mfaCode.value)) {
    ElMessage.warning("请输入认证器当前显示的 6 位验证码");
    return;
  }
  mfaEnabling.value = true;
  try {
    const status = await authApi.enableMfa(mfaCode.value);
    mfaStatus.value = status;
    if (authStore.user) authStore.updateUser({ ...authStore.user, mfaEnabled: status.enabled });
    mfaVisible.value = false;
    ElMessage.success("MFA 多因素认证已启用");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "MFA 启用失败"));
  } finally {
    mfaCode.value = "";
    mfaEnabling.value = false;
  }
}

async function disableMfa() {
  try {
    const passwordPrompt = await ElMessageBox.prompt("请输入当前登录密码", "停用 MFA", {
      inputType: "password",
      inputPlaceholder: "当前密码",
      confirmButtonText: "继续",
      cancelButtonText: "取消",
    });
    const codePrompt = await ElMessageBox.prompt("请输入认证器当前的 6 位验证码", "验证 MFA", {
      inputPattern: /^\d{6}$/,
      inputErrorMessage: "请输入 6 位数字验证码",
      confirmButtonText: "确认停用",
      cancelButtonText: "取消",
    });
    const status = await authApi.disableMfa(passwordPrompt.value, codePrompt.value);
    mfaStatus.value = status;
    if (authStore.user) authStore.updateUser({ ...authStore.user, mfaEnabled: status.enabled });
    ElMessage.success("MFA 已停用");
  } catch (error: unknown) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(getErrorMessage(error, "MFA 停用失败"));
    }
  }
}

async function exportPersonalData() {
  try {
    const data = await usersApi.exportPersonalData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `admin-x-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    ElMessage.success("个人数据导出文件已生成");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "个人数据导出失败"));
  }
}

async function erasePersonalData() {
  try {
    await ElMessageBox.confirm(
      "注销会清除你的账号资料、访问记录和会话，必要的安全审计证据会依法保留。此操作不可撤销。",
      "确认注销个人账号",
      { type: "warning", confirmButtonText: "继续注销", cancelButtonText: "取消" },
    );
    const passwordPrompt = await ElMessageBox.prompt("请输入当前登录密码确认账号注销", "二次验证", {
      inputType: "password",
      inputPlaceholder: "当前密码",
      confirmButtonText: "验证并注销",
      cancelButtonText: "取消",
      inputValidator: (value) => (value.trim() ? true : "当前密码不能为空"),
    });
    await authStore.reauthenticate(passwordPrompt.value);
    await usersApi.erasePersonalData(passwordPrompt.value);
    await authStore.logout().catch(() => undefined);
    await router.push({ name: "login" });
  } catch (error: unknown) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(getErrorMessage(error, "账号注销失败"));
    }
  }
}

function chooseAvatar() {
  avatarInput.value?.click();
}

function handleAvatarFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    ElMessage.warning("请选择 PNG、JPG 或 WebP 图片");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning("原始图片不能超过 5 MB");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    cropSource.value = String(reader.result ?? "");
    cropVisible.value = Boolean(cropSource.value);
  };
  reader.onerror = () => ElMessage.error("无法读取这张图片");
  reader.readAsDataURL(file);
}

function applyCroppedAvatar(value: string) {
  editForm.avatar = value;
}

async function saveProfile() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    const user = await usersApi.updateProfile({
      avatar: editForm.avatar,
      displayName: editForm.displayName.trim(),
      email: editForm.email.trim(),
      remark: editForm.remark?.trim(),
    });
    authStore.updateUser(user);
    editVisible.value = false;
    ElMessage.success("个人资料已更新");
  } finally {
    saving.value = false;
  }
}

async function acceptPrivacyNotice() {
  try {
    await ElMessageBox.confirm(
      `${PRIVACY_NOTICE_SUMMARY} 当前告知版本：${PRIVACY_NOTICE_VERSION}。确认继续？`,
      "确认个人信息保护告知",
      { confirmButtonText: "确认并继续", cancelButtonText: "取消" },
    );
    privacyConsentSaving.value = true;
    const user = await usersApi.acceptPrivacyNotice({ accepted: true });
    authStore.updateUser(user);
    ElMessage.success("个人信息保护告知已确认");
  } catch (error: unknown) {
    if (error !== "cancel" && error !== "close") {
      ElMessage.error(getErrorMessage(error, "告知确认失败"));
    }
  } finally {
    privacyConsentSaving.value = false;
  }
}

async function savePassword() {
  const valid = await passwordFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  passwordSaving.value = true;
  try {
    await usersApi.updatePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    passwordVisible.value = false;
    ElMessage.success("登录密码已更新，请使用新密码重新登录");
    await authStore.logout().catch(() => undefined);
    await router.push({ name: "login" });
  } finally {
    passwordForm.currentPassword = "";
    passwordForm.newPassword = "";
    passwordForm.confirmPassword = "";
    passwordSaving.value = false;
  }
}

onMounted(() => {
  void loadMfaStatus();
  void loadPasswordStatus();
});
</script>

<template>
  <div class="profile-page">
    <div class="page-heading">
      <div>
        <p class="page-kicker">ACCOUNT</p>
        <h1>个人资料</h1>
        <p class="page-description">管理你的账号身份、头像和联系信息。</p>
      </div>
      <el-button type="primary" plain @click="openEdit">编辑资料</el-button>
    </div>

    <el-alert
      v-if="passwordStatus?.expiringSoon"
      class="password-expiry-alert"
      :closable="false"
      show-icon
      title="登录密码即将到期"
      type="warning"
    >
      当前密码将在 {{ passwordStatus.daysRemaining }} 天后到期，请及时修改。
    </el-alert>

    <el-alert
      v-if="profile && profile.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION"
      class="privacy-notice-alert"
      :closable="false"
      show-icon
      title="需要确认个人信息保护告知"
      type="info"
    >
      当前账号尚未确认最新告知版本 {{ PRIVACY_NOTICE_VERSION }}。{{ PRIVACY_NOTICE_SUMMARY }}
      <el-button text type="primary" :loading="privacyConsentSaving" @click="acceptPrivacyNotice">
        阅读并确认
      </el-button>
    </el-alert>

    <div class="profile-grid">
      <el-card class="profile-card profile-card--identity" shadow="never">
        <div class="profile-hero">
          <el-avatar :size="82" class="profile-avatar" :src="profile?.avatar || undefined">
            {{ initials }}
          </el-avatar>
          <div>
            <p class="profile-eyebrow">WORKSPACE MEMBER</p>
            <h2>{{ profile?.displayName ?? "管理员" }}</h2>
            <span>@{{ profile?.username ?? "admin" }}</span>
          </div>
          <el-tag type="success" effect="light">{{ roleName }}</el-tag>
        </div>

        <p v-if="profile?.remark" class="profile-bio">{{ profile.remark }}</p>
        <p v-else class="profile-bio profile-bio--empty">还没有填写个人简介。</p>

        <div class="profile-details">
          <div class="profile-detail">
            <span class="profile-detail__icon"
              ><el-icon><UserFilled /></el-icon
            ></span>
            <div>
              <small>显示名称</small><strong>{{ profile?.displayName ?? "管理员" }}</strong>
            </div>
          </div>
          <div class="profile-detail">
            <span class="profile-detail__icon"
              ><el-icon><Setting /></el-icon
            ></span>
            <div>
              <small>账号角色</small><strong>{{ roleName }}</strong>
            </div>
          </div>
          <div class="profile-detail">
            <span class="profile-detail__icon"
              ><el-icon><Lock /></el-icon
            ></span>
            <div>
              <small>最近登录</small><strong>{{ lastLoginLabel }}</strong>
            </div>
          </div>
        </div>
      </el-card>

      <el-card class="profile-card profile-card--contact" shadow="never">
        <div class="profile-card__heading">
          <span class="profile-card__heading-icon"
            ><el-icon><Message /></el-icon
          ></span>
          <div>
            <h2>联系信息</h2>
            <p>用于账号识别和成员联系。</p>
          </div>
        </div>
        <div class="profile-contact-list">
          <div class="profile-contact-row">
            <span>用户名</span><strong>{{ profile?.username ?? "admin" }}</strong>
          </div>
          <div class="profile-contact-row">
            <span>邮箱地址</span><strong>{{ profile?.email ?? "未绑定邮箱" }}</strong>
          </div>
          <div class="profile-contact-row">
            <span>成员编号</span><code>{{ profile?.id ?? "-" }}</code>
          </div>
        </div>
      </el-card>
    </div>

    <el-card class="profile-security-card" shadow="never">
      <div class="profile-security-card__icon">
        <el-icon><Lock /></el-icon>
      </div>
      <div>
        <h2>账号安全</h2>
        <p>定期检查密码、MFA 和登录记录，保护管理账号安全。</p>
      </div>
      <div class="profile-security-actions">
        <el-button text type="primary" @click="openPasswordDialog">
          修改登录密码 <el-icon><ArrowRight /></el-icon>
        </el-button>
        <el-button v-if="!mfaStatus.enabled" text type="primary" @click="openMfaDialog">
          绑定 MFA <el-icon><ArrowRight /></el-icon>
        </el-button>
        <el-button v-else text type="danger" @click="disableMfa">停用 MFA</el-button>
        <el-button text type="primary" @click="exportPersonalData">导出个人数据</el-button>
        <el-button text type="danger" @click="erasePersonalData">注销账号</el-button>
      </div>
    </el-card>

    <el-dialog
      v-model="mfaVisible"
      title="绑定 MFA 多因素认证"
      width="min(520px, calc(100vw - 32px))"
    >
      <el-alert
        v-if="!mfaSetup"
        title="绑定后登录需要账号密码和认证器动态验证码"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form label-position="top">
        <el-form-item label="当前密码">
          <el-input
            v-model="mfaPassword"
            type="password"
            show-password
            autocomplete="off"
            placeholder="先验证当前密码"
            :disabled="Boolean(mfaSetup)"
          />
        </el-form-item>
      </el-form>
      <div v-if="mfaSetup" class="mfa-setup-result">
        <p>请在认证器中新增以下账户，然后输入当前 6 位验证码完成绑定。</p>
        <code>{{ mfaSetup.secret }}</code>
        <el-input v-model="mfaSetup.otpauthUrl" readonly />
        <el-input v-model="mfaCode" maxlength="6" placeholder="认证器验证码" />
      </div>
      <template #footer>
        <el-button @click="mfaVisible = false">取消</el-button>
        <el-button v-if="!mfaSetup" type="primary" :loading="mfaLoading" @click="beginMfaSetup">
          生成绑定密钥
        </el-button>
        <el-button v-else type="primary" :loading="mfaEnabling" @click="enableMfa">
          确认启用 MFA
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="editVisible"
      width="min(600px, calc(100vw - 32px))"
      title="编辑个人资料"
      append-to-body
    >
      <div class="edit-profile">
        <div class="avatar-editor">
          <div class="avatar-preview">
            <el-avatar :size="84" :src="editForm.avatar || undefined">
              {{ editForm.displayName.slice(0, 1) || "A" }}
            </el-avatar>
            <button type="button" aria-label="更换头像" @click="chooseAvatar">
              <el-icon><Camera /></el-icon>
            </button>
          </div>
          <div class="avatar-editor__copy">
            <strong>个人头像</strong>
            <span>支持 PNG、JPG、WebP，选择后可拖动和缩放裁剪。</span>
            <div>
              <el-button size="small" @click="chooseAvatar">选择图片</el-button>
              <el-button
                v-if="editForm.avatar"
                size="small"
                text
                type="danger"
                @click="editForm.avatar = ''"
                >移除头像</el-button
              >
            </div>
          </div>
          <input
            ref="avatarInput"
            class="avatar-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            @change="handleAvatarFile"
          />
        </div>

        <el-form ref="formRef" :model="editForm" :rules="rules" label-position="top">
          <div class="edit-form-grid">
            <el-form-item label="显示名称" prop="displayName">
              <el-input
                v-model="editForm.displayName"
                maxlength="50"
                placeholder="请输入显示名称"
              />
            </el-form-item>
            <el-form-item label="邮箱地址" prop="email">
              <el-input v-model="editForm.email" placeholder="name@company.com" />
            </el-form-item>
          </div>
          <el-form-item label="个人简介" prop="remark">
            <el-input
              v-model="editForm.remark"
              type="textarea"
              :rows="3"
              maxlength="200"
              show-word-limit
              placeholder="简单介绍你的职责或团队"
            />
          </el-form-item>
          <div class="username-hint">
            登录用户名
            <strong>@{{ profile?.username }}</strong> 由管理员维护，不能在个人资料中修改。
          </div>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveProfile">保存资料</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="passwordVisible"
      width="min(460px, calc(100vw - 32px))"
      title="修改登录密码"
      append-to-body
    >
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-position="top"
      >
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input
            v-model="passwordForm.currentPassword"
            type="password"
            show-password
            autocomplete="off"
            placeholder="请输入当前登录密码"
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
            autocomplete="off"
            placeholder="至少 8 位，需满足四类字符要求"
          />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            show-password
            autocomplete="off"
            placeholder="请再次输入新密码"
          />
        </el-form-item>
        <div class="password-hint">
          普通成员密码至少 8 位，管理员密码至少 12
          位，并同时包含数字、大写字母、小写字母和特殊字符。
          修改成功后当前登录状态仍会保留，下次登录请使用新密码。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="savePassword"
          >确认修改</el-button
        >
      </template>
    </el-dialog>

    <AvatarCropDialog v-model="cropVisible" :image-url="cropSource" @confirm="applyCroppedAvatar" />
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 1180px;
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
.profile-eyebrow {
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
  font-size: 13px;
}
.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 18px;
}
.profile-card {
  min-height: 310px;
}
.profile-card :deep(.el-card__body) {
  height: 100%;
  padding: 28px;
}
.profile-hero {
  display: flex;
  align-items: center;
  gap: 17px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--ax-line-soft);
}
.profile-avatar,
.avatar-preview :deep(.el-avatar) {
  flex: 0 0 auto;
  color: #fff;
  font-size: 26px;
  font-weight: 700;
  background: linear-gradient(135deg, #a99cf8, #6755e8);
}
.profile-hero > div {
  min-width: 0;
  flex: 1;
}
.profile-eyebrow {
  margin-bottom: 6px;
  font-size: 9px;
}
.profile-hero h2,
.profile-card__heading h2,
.profile-security-card h2 {
  margin: 0;
  color: var(--ax-heading);
  font-size: 18px;
  font-weight: 700;
}
.profile-hero > div > span,
.profile-card__heading p,
.profile-security-card p {
  color: var(--ax-muted);
  font-size: 12px;
}
.profile-hero > div > span {
  display: block;
  margin-top: 5px;
}
.profile-bio {
  min-height: 20px;
  margin: 18px 0 0;
  color: var(--ax-text);
  font-size: 13px;
  line-height: 1.65;
}
.profile-bio--empty {
  color: var(--ax-muted);
  font-style: italic;
}
.profile-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  padding-top: 20px;
}
.profile-detail {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
}
.profile-detail__icon,
.profile-card__heading-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 8px;
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
}
.profile-detail small,
.profile-detail strong {
  display: block;
}
.profile-detail small {
  color: var(--ax-muted);
  font-size: 10px;
}
.profile-detail strong {
  margin-top: 4px;
  overflow: hidden;
  color: var(--ax-heading);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-card__heading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--ax-line-soft);
}
.profile-card__heading p {
  margin: 6px 0 0;
}
.profile-contact-list {
  padding-top: 8px;
}
.profile-contact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 0;
  border-bottom: 1px solid var(--ax-line-soft);
  font-size: 12px;
}
.profile-contact-row:last-child {
  border-bottom: 0;
}
.profile-contact-row span {
  color: var(--ax-muted);
}
.profile-contact-row strong,
.profile-contact-row code {
  overflow: hidden;
  color: var(--ax-heading);
  text-overflow: ellipsis;
}
.profile-contact-row code {
  font-size: 10px;
}
.profile-security-card {
  margin-top: 18px;
}
.profile-security-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 26px;
}
.profile-security-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
}
.profile-security-card > :deep(.el-card__body) > div:nth-child(2) {
  min-width: 0;
  flex: 1;
}
.profile-security-card p {
  margin: 5px 0 0;
}
.profile-security-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}
.mfa-setup-result {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--ax-line-soft);
  border-radius: 10px;
  background: var(--ax-surface-soft);
}
.mfa-setup-result p {
  margin: 0;
  color: var(--ax-muted);
  font-size: 12px;
  line-height: 1.6;
}
.mfa-setup-result code {
  padding: 8px 10px;
  color: var(--ax-heading);
  font-size: 13px;
  letter-spacing: 0.14em;
  background: var(--ax-surface);
}
.edit-profile {
  margin-top: -4px;
}
.avatar-editor {
  position: relative;
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 24px;
  padding: 18px;
  border: 1px solid var(--ax-line-soft);
  border-radius: 12px;
  background: var(--ax-surface-soft);
}
.avatar-preview {
  position: relative;
  flex: 0 0 auto;
}
.avatar-preview button {
  position: absolute;
  right: -2px;
  bottom: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 29px;
  height: 29px;
  border: 3px solid var(--ax-surface);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  background: var(--ax-primary);
}
.avatar-editor__copy {
  min-width: 0;
}
.avatar-editor__copy strong,
.avatar-editor__copy span {
  display: block;
}
.avatar-editor__copy strong {
  color: var(--ax-heading);
  font-size: 14px;
}
.avatar-editor__copy span {
  margin: 5px 0 10px;
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.55;
}
.avatar-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
.edit-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.username-hint {
  padding: 12px 14px;
  border-radius: 9px;
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.6;
  background: var(--ax-surface-soft);
}
.password-hint {
  padding: 12px 14px;
  border-radius: 9px;
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.6;
  background: var(--ax-surface-soft);
}
.username-hint strong {
  color: var(--ax-heading);
}
@media (max-width: 820px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .profile-details,
  .edit-form-grid {
    grid-template-columns: 1fr;
  }
  .profile-security-card :deep(.el-card__body),
  .avatar-editor {
    align-items: flex-start;
  }
  .profile-security-card :deep(.el-card__body) {
    flex-wrap: wrap;
  }
}
</style>
