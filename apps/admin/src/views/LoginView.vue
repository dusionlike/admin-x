<script setup lang="ts">
import { computed, onBeforeMount, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { ArrowRight, Lock, Message, User } from "@element-plus/icons-vue";

import type { LoginRequest, SetupAdminRequest } from "@admin-x/shared";
import { getAccountPasswordPolicyError, getErrorMessage } from "@admin-x/shared";

import { authApi } from "@/api/auth";
import { SESSION_EXPIRED_KEY } from "@/api/http";
import LoginNetwork from "@/components/LoginNetwork.vue";
import LoginScene from "@/components/LoginScene.vue";
import PrivacyNoticeDialog from "@/components/PrivacyNoticeDialog.vue";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

type SetupForm = SetupAdminRequest & { confirmPassword: string };
type ExpiredPasswordForm = { confirmPassword: string; newPassword: string };

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const themeStore = useThemeStore();
const formRef = ref<FormInstance>();
const setupFormRef = ref<FormInstance>();
const checkingSetup = ref(true);
const needsSetup = ref(false);
const setupLoading = ref(false);
const emailMfaEnabled = ref(false);
const emailMfaConfigLoading = ref(true);
const emailCodeLoading = ref(false);
const emailCodeHint = ref("");
const emailCodeCountdown = ref(0);
const emailVerificationVisible = ref(false);
const captchaImage = ref("");
const captchaLoading = ref(true);
const captchaRequired = ref(true);
const expiredPasswordVisible = ref(false);
const expiredPasswordLoading = ref(false);
const privacyNoticeVisible = ref(false);
const expiredPasswordFormRef = ref<FormInstance>();
const form = reactive<LoginRequest>({
  captchaCode: "",
  captchaId: "",
  mfaCode: "",
  password: "",
  username: "",
});
const setupForm = reactive<SetupForm>({
  confirmPassword: "",
  displayName: "",
  email: "",
  password: "",
  privacyNoticeAccepted: false,
  username: "",
});
const expiredPasswordForm = reactive<ExpiredPasswordForm>({
  confirmPassword: "",
  newPassword: "",
});
let emailCodeTimer: number | undefined;

const loginSubmitLabel = computed(() => {
  if (emailVerificationVisible.value) {
    return "验证并登录";
  }
  if (emailMfaConfigLoading.value) {
    return "准备登录…";
  }
  return emailMfaEnabled.value ? "获取邮箱验证码" : "登录系统";
});

const loginRules: FormRules<LoginRequest> = {
  password: [
    { message: "请输入密码", required: true, trigger: "blur" },
    { min: 6, message: "密码长度不能少于 6 位", trigger: "blur" },
  ],
  captchaCode: [
    {
      trigger: "blur",
      validator: (_rule, value, callback) => {
        if (!captchaRequired.value) {
          callback();
          return;
        }
        if (!value) {
          callback(new Error("请输入图形验证码"));
          return;
        }
        callback(
          /^[A-Za-z0-9]{4}$/u.test(String(value)) ? undefined : new Error("请输入 4 位图形验证码"),
        );
      },
    },
  ],
  mfaCode: [
    {
      trigger: "blur",
      validator: (_rule, value, callback) => {
        if (!value) {
          callback(emailVerificationVisible.value ? new Error("请输入验证码") : undefined);
          return;
        }
        callback(/^\d{6}$/.test(String(value)) ? undefined : new Error("验证码应为 6 位数字"));
      },
    },
  ],
  username: [{ message: "请输入用户名", required: true, trigger: "blur" }],
};

const setupRules: FormRules<SetupForm> = {
  confirmPassword: [
    {
      message: "两次输入的密码不一致",
      trigger: "blur",
      validator: (_rule, value, callback) => {
        callback(value === setupForm.password ? undefined : new Error("两次输入的密码不一致"));
      },
    },
  ],
  displayName: [{ message: "请输入显示名称", required: true, trigger: "blur" }],
  email: [
    { message: "请输入邮箱", required: true, trigger: "blur" },
    { message: "请输入有效的邮箱地址", type: "email", trigger: "blur" },
  ],
  password: [
    { message: "请输入密码", required: true, trigger: "blur" },
    {
      trigger: "blur",
      validator: (_rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        const error = getAccountPasswordPolicyError(String(value), {
          role: "system-admin",
          username: setupForm.username,
        });
        callback(error ? new Error(error) : undefined);
      },
    },
  ],
  privacyNoticeAccepted: [
    {
      message: "请先阅读并同意个人信息保护告知",
      trigger: "change",
      validator: (_rule, value, callback) =>
        value === true ? callback() : callback(new Error("请先阅读并同意个人信息保护告知")),
    },
  ],
  username: [
    { message: "请输入用户名", required: true, trigger: "blur" },
    { min: 3, message: "用户名至少 3 个字符", trigger: "blur" },
  ],
};

const expiredPasswordRules: FormRules<ExpiredPasswordForm> = {
  confirmPassword: [
    { message: "请再次输入新密码", required: true, trigger: "blur" },
    {
      trigger: "blur",
      validator: (_rule, value, callback) => {
        callback(
          value === expiredPasswordForm.newPassword ? undefined : new Error("两次输入的密码不一致"),
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
          username: form.username,
        });
        callback(error ? new Error(error) : undefined);
      },
    },
  ],
};

async function loadSetupStatus() {
  try {
    const result = await authApi.setupStatus();
    needsSetup.value = result.needsSetup;
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "无法读取管理中心初始化状态"));
  } finally {
    checkingSetup.value = false;
  }
}

async function loadMfaConfig() {
  try {
    const result = await authApi.mfaConfig();
    emailMfaEnabled.value = result.emailEnabled;
  } catch {
    emailMfaEnabled.value = false;
  } finally {
    emailMfaConfigLoading.value = false;
  }
}

async function redirectToApp() {
  const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/dashboard";
  await router.push(redirect);
}

function clearLoginSecrets() {
  form.captchaCode = "";
  form.password = "";
  form.mfaCode = "";
}

async function refreshCaptcha() {
  captchaLoading.value = true;
  try {
    const result = await authApi.loginCaptcha();
    captchaRequired.value = result.required !== false;
    captchaImage.value = captchaRequired.value ? result.image : "";
    form.captchaCode = "";
    form.captchaId = captchaRequired.value ? result.id : "";
  } catch (error: unknown) {
    captchaRequired.value = true;
    captchaImage.value = "";
    form.captchaId = "";
    ElMessage.error(getErrorMessage(error, "图形验证码加载失败，请稍后重试"));
  } finally {
    captchaLoading.value = false;
  }
}

function clearEmailCodeTimer() {
  if (emailCodeTimer !== undefined) {
    window.clearInterval(emailCodeTimer);
    emailCodeTimer = undefined;
  }
  emailCodeCountdown.value = 0;
}

function startEmailCodeCountdown() {
  clearEmailCodeTimer();
  emailCodeCountdown.value = 60;
  emailCodeTimer = window.setInterval(() => {
    if (emailCodeCountdown.value <= 1) {
      clearEmailCodeTimer();
      return;
    }
    emailCodeCountdown.value -= 1;
  }, 1_000);
}

function clearSetupSecrets() {
  setupForm.password = "";
  setupForm.confirmPassword = "";
}

function confirmPrivacyNoticeRead() {
  setupForm.privacyNoticeAccepted = true;
}

async function handleLogin() {
  if (emailMfaConfigLoading.value || captchaLoading.value) {
    return;
  }
  if (captchaRequired.value && !form.captchaId) {
    await refreshCaptcha();
    return;
  }
  if (!formRef.value) {
    return;
  }

  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  if (emailMfaEnabled.value && !emailVerificationVisible.value) {
    await requestEmailCode();
    return;
  }

  try {
    const result = await authStore.login({
      ...form,
      captchaCode: captchaRequired.value ? form.captchaCode : undefined,
      captchaId: captchaRequired.value ? form.captchaId : undefined,
      mfaCode: form.mfaCode || undefined,
    });
    clearLoginSecrets();
    await redirectToApp();
    ElMessage.success("欢迎回来，已进入 Admin X 管理后台");
    if (result.passwordStatus?.expiringSoon && result.passwordStatus.daysRemaining) {
      ElMessage.warning(`登录密码将在 ${result.passwordStatus.daysRemaining} 天后到期，请及时修改`);
    }
  } catch (error: unknown) {
    const message = getErrorMessage(error, "登录失败，请检查账号或密码");
    if (message.includes("密码已过期")) {
      expiredPasswordForm.newPassword = "";
      expiredPasswordForm.confirmPassword = "";
      form.captchaCode = "";
      void refreshCaptcha();
      expiredPasswordVisible.value = true;
      return;
    }
    if (emailVerificationVisible.value) {
      form.mfaCode = "";
    } else {
      clearLoginSecrets();
    }
    void refreshCaptcha();
    ElMessage.error(message);
  }
}

async function changeExpiredPassword() {
  const valid = await expiredPasswordFormRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  expiredPasswordLoading.value = true;
  try {
    await authApi.changeExpiredPassword({
      currentPassword: form.password,
      newPassword: expiredPasswordForm.newPassword,
      username: form.username,
    });
    expiredPasswordVisible.value = false;
    form.password = "";
    form.mfaCode = "";
    expiredPasswordForm.newPassword = "";
    expiredPasswordForm.confirmPassword = "";
    ElMessage.success("密码已更新，请使用新密码重新登录");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "过期密码更新失败"));
  } finally {
    expiredPasswordLoading.value = false;
  }
}

async function requestEmailCode() {
  if (emailCodeCountdown.value > 0 || emailCodeLoading.value) {
    return;
  }
  if (!emailMfaEnabled.value) {
    ElMessage.info("邮箱验证尚未启用");
    return;
  }
  if (!form.username.trim() || !form.password) {
    ElMessage.warning("请先填写用户名和密码，再获取邮箱验证码");
    return;
  }
  emailCodeLoading.value = true;
  try {
    const result = await authApi.requestEmailCode({
      captchaCode: captchaRequired.value ? form.captchaCode : undefined,
      captchaId: captchaRequired.value ? form.captchaId : undefined,
      password: form.password,
      username: form.username,
    });
    form.mfaCode = "";
    emailVerificationVisible.value = true;
    emailCodeHint.value = `验证码已发送至 ${result.maskedEmail}，${result.expiresIn / 60} 分钟内有效`;
    startEmailCodeCountdown();
    ElMessage.success("邮箱验证码已发送");
  } catch (error: unknown) {
    const message = getErrorMessage(error, "邮箱验证码发送失败");
    if (message.includes("密码已过期")) {
      expiredPasswordForm.newPassword = "";
      expiredPasswordForm.confirmPassword = "";
      form.captchaCode = "";
      void refreshCaptcha();
      expiredPasswordVisible.value = true;
      return;
    }
    if (message.includes("图形验证码")) {
      form.captchaCode = "";
      void refreshCaptcha();
    }
    ElMessage.error(message);
  } finally {
    emailCodeLoading.value = false;
  }
}

async function handleSetup() {
  if (!setupFormRef.value) {
    return;
  }

  const valid = await setupFormRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  setupLoading.value = true;
  try {
    const result = await authApi.setup({
      displayName: setupForm.displayName,
      email: setupForm.email,
      password: setupForm.password,
      privacyNoticeAccepted: setupForm.privacyNoticeAccepted,
      username: setupForm.username,
    });
    authStore.setSession(result);
    clearSetupSecrets();
    await redirectToApp();
    ElMessage.success("首位管理员创建成功，已进入 Admin X 管理后台");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "初始化失败，请稍后重试"));
  } finally {
    setupLoading.value = false;
  }
}

onBeforeMount(() => {
  themeStore.enterDarkPreview();
});

onMounted(() => {
  if (sessionStorage.getItem(SESSION_EXPIRED_KEY)) {
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    ElMessage.warning("登录会话已过期，请重新登录");
  }
  void loadSetupStatus();
  void loadMfaConfig();
  void refreshCaptcha();
});

onBeforeUnmount(() => {
  clearEmailCodeTimer();
  themeStore.exitPreview();
});
</script>

<template>
  <div class="login-page">
    <div class="login-background" aria-hidden="true">
      <LoginScene class="login-scene-layer" />
      <div class="login-vignette"></div>
      <LoginNetwork />
    </div>
    <header class="login-masthead">
      <div class="login-brand">
        <img class="brand-mark" src="/icon.png" alt="" aria-hidden="true" />
        <span class="login-brand__product">ADMIN <b>X</b></span>
      </div>
      <div class="login-tools"><span>统一管理工作台</span></div>
    </header>

    <main class="login-main">
      <section class="login-intro" aria-labelledby="login-intro-title">
        <p class="login-eyebrow"><span></span> YOUR WORKSPACE, CONNECTED</p>
        <h1 id="login-intro-title">让管理井然有序，<br /><em>让工作从容开始。</em></h1>
        <p class="login-description">
          从团队成员到系统配置，将日常管理汇聚一处。<br />在 Admin X，开启专注、高效的工作时刻。
        </p>
        <div class="workspace-preview" aria-label="管理工作台功能概览">
          <div class="preview-bar">
            <span class="preview-dots" aria-hidden="true">● ● ●</span><span>ADMIN X / 工作空间</span
            ><span class="preview-tag">功能概览</span>
          </div>
          <div class="preview-body">
            <div class="preview-rail" aria-hidden="true">
              <span>AX</span><i></i><i></i><i></i><i></i>
            </div>
            <div class="preview-content">
              <div class="preview-heading">
                <div>
                  <small>WORKSPACE OVERVIEW</small>
                  <h3>每一项工作，都有条不紊</h3>
                </div>
                <el-icon><ArrowRight /></el-icon>
              </div>
              <div class="preview-modules">
                <div>
                  <el-icon><User /></el-icon><strong>用户管理</strong
                  ><span>团队成员，清晰掌握</span>
                </div>
                <div>
                  <el-icon><Lock /></el-icon><strong>权限控制</strong
                  ><span>各司其职，有序协作</span>
                </div>
              </div>
              <div class="preview-activity">
                <span class="activity-symbol"
                  ><el-icon><Message /></el-icon
                ></span>
                <div>
                  <strong>操作有记录，管理有依据</strong><span>登录访问与活动记录，集中查看</span>
                </div>
                <span class="activity-lines" aria-hidden="true">▂ ▄ ▃ ▆ ▅ █</span>
              </div>
            </div>
          </div>
        </div>
        <div class="login-benefits">
          <span><b>01</b> 集中管理</span><span><b>02</b> 精细授权</span
          ><span><b>03</b> 活动追踪</span>
        </div>
      </section>
      <section class="login-panel" aria-label="账号登录">
        <div class="login-card">
          <div class="login-card__heading">
            <span class="login-card__eyebrow">{{
              needsSetup ? "GET STARTED" : "WELCOME BACK"
            }}</span>
            <h2>{{ needsSetup ? "创建管理空间" : "欢迎回来" }}</h2>
            <p>
              {{
                needsSetup ? "设置首位系统管理员，开启管理后台。" : "登录您的账号，继续今天的工作。"
              }}
            </p>
          </div>

          <el-form v-if="checkingSetup" class="setup-loading" label-position="top">
            <p>正在准备 Admin X 管理后台…</p>
          </el-form>

          <el-form
            v-else-if="needsSetup"
            ref="setupFormRef"
            class="login-form"
            :model="setupForm"
            :rules="setupRules"
            label-position="top"
            @submit.prevent="handleSetup"
          >
            <el-form-item label="显示名称" prop="displayName">
              <el-input v-model="setupForm.displayName" size="large" placeholder="例如：张小明">
                <template #prefix
                  ><el-icon> <User /> </el-icon
                ></template>
              </el-input>
            </el-form-item>
            <el-form-item label="用户名" prop="username">
              <el-input v-model="setupForm.username" size="large" placeholder="用于登录的账号">
                <template #prefix
                  ><el-icon> <User /> </el-icon
                ></template>
              </el-input>
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="setupForm.email" size="large" placeholder="name@company.com">
                <template #prefix
                  ><el-icon> <Message /> </el-icon
                ></template>
              </el-input>
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input
                v-model="setupForm.password"
                size="large"
                type="password"
                show-password
                autocomplete="off"
                placeholder="至少 12 位，需满足复杂度要求"
              >
                <template #prefix
                  ><el-icon> <Lock /> </el-icon
                ></template>
              </el-input>
            </el-form-item>
            <p class="password-policy-hint">
              管理员密码至少 12 位，并同时包含数字、大写字母、小写字母和特殊字符。
            </p>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input
                v-model="setupForm.confirmPassword"
                size="large"
                type="password"
                show-password
                autocomplete="off"
                placeholder="再次输入密码"
              >
                <template #prefix
                  ><el-icon> <Lock /> </el-icon
                ></template>
              </el-input>
            </el-form-item>
            <el-form-item prop="privacyNoticeAccepted">
              <el-checkbox v-model="setupForm.privacyNoticeAccepted" class="privacy-consent">
                <span>我已阅读并同意</span>
                <button
                  class="privacy-notice-link"
                  type="button"
                  @click.stop="privacyNoticeVisible = true"
                >
                  《个人信息保护告知》
                </button>
              </el-checkbox>
            </el-form-item>
            <el-button
              class="login-submit"
              type="primary"
              size="large"
              native-type="submit"
              :loading="setupLoading"
            >
              创建系统管理员并进入管理中心
              <el-icon>
                <ArrowRight />
              </el-icon>
            </el-button>
          </el-form>

          <el-form
            v-else
            ref="formRef"
            class="login-form"
            :model="form"
            :rules="loginRules"
            label-position="top"
            @submit.prevent="handleLogin"
          >
            <el-form-item label="用户名" prop="username">
              <el-input
                v-model="form.username"
                size="large"
                autocomplete="username"
                placeholder="请输入账号"
              >
                <template #prefix
                  ><el-icon> <User /> </el-icon
                ></template>
              </el-input>
            </el-form-item>
            <el-form-item label="密码" prop="password">
              <el-input
                v-model="form.password"
                size="large"
                type="password"
                show-password
                autocomplete="off"
                placeholder="请输入密码"
              >
                <template #prefix
                  ><el-icon> <Lock /> </el-icon
                ></template>
              </el-input>
            </el-form-item>
            <el-form-item v-if="captchaRequired" label="图形验证码" prop="captchaCode">
              <div class="login-captcha">
                <el-input
                  v-model="form.captchaCode"
                  class="login-captcha__input"
                  size="large"
                  maxlength="4"
                  autocomplete="off"
                  placeholder="请输入图中的验证码"
                />
                <button
                  class="login-captcha__image"
                  type="button"
                  aria-label="刷新图形验证码"
                  :disabled="captchaLoading"
                  @click="refreshCaptcha"
                >
                  <img v-if="captchaImage" :src="captchaImage" alt="图形验证码，点击刷新" />
                  <span v-else>加载中…</span>
                </button>
              </div>
              <small class="login-captcha__hint">看不清？点击右侧图片换一张</small>
            </el-form-item>
            <el-form-item v-if="emailVerificationVisible" label="邮箱验证码" prop="mfaCode">
              <el-input
                v-model="form.mfaCode"
                size="large"
                maxlength="6"
                autocomplete="one-time-code"
                placeholder="请输入邮箱收到的 6 位验证码"
              >
                <template #append>
                  <el-button
                    native-type="button"
                    :disabled="emailCodeCountdown > 0"
                    :loading="emailCodeLoading"
                    @click="requestEmailCode"
                  >
                    {{ emailCodeCountdown > 0 ? `${emailCodeCountdown} 秒后重发` : "重新发送" }}
                  </el-button>
                </template>
              </el-input>
              <small class="login-mfa-hint">
                {{ emailCodeHint || "验证码会发送到当前账号绑定的邮箱" }}
              </small>
            </el-form-item>
            <el-button
              class="login-submit"
              type="primary"
              size="large"
              native-type="submit"
              :disabled="emailMfaConfigLoading"
              :loading="authStore.loginLoading"
            >
              {{ loginSubmitLabel }}
              <el-icon>
                <ArrowRight />
              </el-icon>
            </el-button>
          </el-form>

          <div class="login-help">
            <el-icon><Lock /></el-icon>
            <p>
              {{
                needsSetup
                  ? "首次使用需创建系统管理员，完成后即可进入工作台。"
                  : "账号由管理员分配。如忘记密码或无法登录，请联系您的系统管理员。"
              }}
            </p>
          </div>

          <PrivacyNoticeDialog
            v-model="privacyNoticeVisible"
            action-label="创建管理员账号"
            @read="confirmPrivacyNoticeRead"
          />

          <el-dialog
            v-model="expiredPasswordVisible"
            title="密码已过期，请先更新密码"
            width="min(460px, calc(100vw - 32px))"
            append-to-body
          >
            <p class="expired-password-copy">
              当前账号密码已超过安全有效期。请使用刚才填写的当前密码设置新密码，更新成功后再重新登录。
            </p>
            <el-form
              ref="expiredPasswordFormRef"
              :model="expiredPasswordForm"
              :rules="expiredPasswordRules"
              label-position="top"
            >
              <el-form-item label="新密码" prop="newPassword">
                <el-input
                  v-model="expiredPasswordForm.newPassword"
                  type="password"
                  show-password
                  autocomplete="off"
                  placeholder="至少 8 位，需满足四类字符要求"
                />
              </el-form-item>
              <el-form-item label="确认新密码" prop="confirmPassword">
                <el-input
                  v-model="expiredPasswordForm.confirmPassword"
                  type="password"
                  show-password
                  autocomplete="off"
                  placeholder="请再次输入新密码"
                />
              </el-form-item>
            </el-form>
            <template #footer>
              <el-button @click="expiredPasswordVisible = false">取消</el-button>
              <el-button
                type="primary"
                :loading="expiredPasswordLoading"
                @click="changeExpiredPassword"
              >
                更新密码
              </el-button>
            </template>
          </el-dialog>
        </div>
      </section>
    </main>
    <footer class="login-footer">
      <span>Admin X · 让管理更简单</span
      ><button type="button" class="privacy-notice-link" @click="privacyNoticeVisible = true">
        个人信息保护告知 <el-icon><ArrowRight /></el-icon>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.login-page {
  --login-card-bg: rgb(255 255 255 / 70%);
  --login-field-bg: rgb(255 255 255 / 32%);
  --login-preview-bg: rgb(255 255 255 / 34%);
  position: relative;
  isolation: isolate;
  height: 100dvh;
  overflow: auto;
  color: var(--ax-content);
  background: var(--ax-login-backdrop);
}
/* Keep the original animated scene behind the scrollable content. */
.login-background {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: var(--ax-login-backdrop);
}
.login-scene-layer,
.login-vignette {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.login-vignette {
  background: linear-gradient(90deg, var(--ax-login-shade), transparent 75%);
}
.login-intro,
.login-masthead,
.login-footer {
  --ax-heading: var(--ax-login-heading);
  --ax-content: var(--ax-login-copy);
  --ax-muted: var(--ax-login-copy);
  --ax-primary: var(--ax-login-accent);
}
.workspace-preview {
  --ax-heading: var(--ax-text);
  --ax-muted: var(--el-text-color-secondary);
  backdrop-filter: blur(18px);
}
.login-masthead,
.login-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1440px;
  margin: auto;
  padding: 28px 5%;
}
.login-brand,
.login-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}
.login-brand {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--ax-heading);
}
.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
}
.login-brand b {
  color: var(--ax-primary);
}
.login-tools {
  font-size: 12px;
  color: var(--ax-muted);
}
.login-main {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(360px, 0.9fr);
  gap: clamp(40px, 7vw, 110px);
  align-items: center;
  max-width: 1240px;
  min-height: calc(100dvh - 178px);
  margin: auto;
  padding: 38px 40px;
}
.login-eyebrow,
.login-card__eyebrow {
  color: var(--ax-primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
}
.login-eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 25px;
}
.login-eyebrow > span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ax-primary);
  box-shadow: 0 0 0 5px var(--ax-primary-soft);
}
.login-intro h1 {
  margin: 0;
  font-size: clamp(32px, 3.3vw, 47px);
  line-height: 1.5;
  letter-spacing: -0.045em;
  color: var(--ax-heading);
}
.login-intro em {
  color: var(--ax-primary);
  font-style: normal;
}
.login-description {
  color: var(--ax-muted);
  font-size: 14px;
  line-height: 1.9;
  margin: 20px 0 34px;
}
.workspace-preview {
  border: 1px solid var(--ax-line);
  border-radius: 14px;
  background: var(--login-preview-bg);
  box-shadow:
    0 24px 64px rgb(2 7 28 / 24%),
    0 0 0 1px rgb(255 255 255 / 8%) inset;
  backdrop-filter: blur(20px) saturate(130%);
  overflow: hidden;
  transform: perspective(1000px) rotateY(-3deg) rotateX(2deg);
}
.preview-bar {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--ax-line);
  font-size: 9px;
  color: var(--ax-muted);
  letter-spacing: 0.04em;
}
.preview-dots {
  color: var(--ax-line);
  letter-spacing: 3px;
}
.preview-tag {
  margin-left: auto;
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
  border-radius: 4px;
  padding: 4px 7px;
}
.preview-body {
  display: flex;
}
.preview-rail {
  width: 49px;
  flex-shrink: 0;
  background: rgb(255 255 255 / 10%);
  border-right: 1px solid var(--ax-line);
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 18px;
  padding: 20px 0;
}
.preview-rail > span {
  color: var(--ax-primary);
  font-size: 11px;
  font-weight: 800;
}
.preview-rail i {
  width: 14px;
  height: 14px;
  border: 2px solid var(--ax-line);
  border-radius: 4px;
}
.preview-rail i:first-of-type {
  background: var(--ax-primary-soft);
  border-color: var(--ax-primary);
}
.preview-content {
  flex: 1;
  min-width: 0;
  padding: 23px;
}
.preview-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--ax-primary);
}
.preview-heading small {
  font-size: 8px;
  letter-spacing: 0.12em;
  color: var(--ax-muted);
}
.preview-heading h3 {
  margin: 7px 0 20px;
  font-size: 15px;
  color: var(--ax-heading);
}
.preview-modules {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.preview-modules > div {
  display: grid;
  gap: 8px;
  border: 1px solid var(--ax-line);
  border-radius: 8px;
  padding: 14px;
  background: rgb(255 255 255 / 9%);
  backdrop-filter: blur(12px);
}
.preview-modules .el-icon {
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
  padding: 7px;
  width: 30px;
  height: 30px;
  border-radius: 8px;
}
.preview-modules strong,
.preview-activity strong {
  font-size: 11px;
  color: var(--ax-heading);
}
.preview-modules span,
.preview-activity div > span {
  font-size: 9px;
  color: var(--ax-muted);
}
.preview-activity {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 17px;
}
.preview-activity > div {
  display: grid;
  gap: 5px;
}
.activity-symbol {
  color: var(--ax-primary);
}
.activity-lines {
  margin-left: auto;
  color: var(--ax-primary);
  font-size: 19px;
  white-space: nowrap;
}
.login-benefits {
  display: flex;
  justify-content: space-between;
  margin-top: 30px;
  font-size: 12px;
  color: var(--ax-muted);
}
.login-benefits b {
  color: var(--ax-primary);
  font-size: 10px;
  margin-right: 8px;
}
.login-panel {
  min-width: 0;
}
.login-page .login-card {
  padding: 36px;
  border: 1px solid var(--ax-line);
  border-radius: 20px;
  background: var(--login-card-bg);
  backdrop-filter: blur(24px) saturate(135%);
  box-shadow:
    0 26px 70px rgb(1 5 24 / 35%),
    0 0 0 1px rgb(255 255 255 / 10%) inset;
}
.login-card__heading h2 {
  margin: 13px 0 8px;
  color: var(--ax-heading);
  font-size: 29px;
  letter-spacing: -0.04em;
}
.login-page .login-card__heading p {
  margin: 0 0 30px;
  color: var(--ax-muted);
  font-size: 13px;
  line-height: 1.7;
}
.login-form :deep(.el-form-item) {
  margin-bottom: 22px;
}
.login-form :deep(.el-form-item__label) {
  color: var(--ax-content);
  font-size: 12px;
}
.login-page .login-form :deep(.el-input__wrapper) {
  min-height: 46px;
  background: var(--login-field-bg);
  box-shadow: 0 0 0 1px var(--ax-line) inset;
  border-radius: 8px;
  backdrop-filter: blur(10px);
}
.login-page .login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--ax-primary) inset,
    0 0 0 3px var(--ax-primary-soft);
}
.login-submit {
  width: 100%;
  min-height: 46px;
  font-weight: 600;
}
.login-submit .el-icon {
  margin-left: 10px;
}
.login-captcha {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 10px;
  width: 100%;
}
.login-captcha__image {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 112px;
  height: 46px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--ax-line);
  border-radius: 8px;
  background: var(--login-field-bg);
  backdrop-filter: blur(10px);
  color: var(--ax-muted);
  cursor: pointer;
}
.login-captcha__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.login-captcha__hint,
.login-mfa-hint,
.password-policy-hint {
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.7;
}
.login-captcha__hint,
.login-mfa-hint {
  margin-top: 6px;
}
.password-policy-hint {
  margin: -10px 0 18px;
}
.login-help {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  border-top: 1px solid var(--ax-line);
  margin-top: 25px;
  padding-top: 20px;
  color: var(--ax-muted);
}
.login-help .el-icon {
  flex-shrink: 0;
  margin-top: 3px;
}
.login-help p {
  margin: 0;
  font-size: 11px;
  line-height: 1.8;
}
.privacy-consent {
  white-space: normal;
  height: auto;
  align-items: flex-start;
}
.privacy-consent :deep(.el-checkbox__label) {
  white-space: normal;
  font-size: 11px;
  line-height: 1.7;
}
.privacy-notice-link {
  padding: 0;
  border: 0;
  color: var(--ax-primary);
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.privacy-notice-link:hover {
  text-decoration: underline;
}
.login-footer {
  gap: 16px;
  color: var(--ax-muted);
  font-size: 11px;
  padding-top: 20px;
  padding-bottom: 24px;
}
.login-footer button {
  display: flex;
  align-items: center;
  gap: 8px;
}
.setup-loading {
  min-height: 180px;
  display: grid;
  place-items: center;
  font-size: 13px;
  color: var(--ax-muted);
}
html.dark .login-page {
  --login-card-bg: rgb(15 27 51 / 68%);
  --login-field-bg: rgb(4 10 30 / 42%);
  --login-preview-bg: rgb(10 21 48 / 46%);
}
@media (min-width: 1600px) {
  .login-main {
    max-width: 1370px;
  }
}
@media (max-width: 1000px) {
  .login-main {
    gap: 35px;
    padding-inline: 28px;
  }
  .login-page .login-card {
    padding: 28px;
  }
  .activity-lines {
    display: none;
  }
  .preview-content {
    padding: 17px;
  }
}
@media (max-width: 760px) {
  .login-main {
    grid-template-columns: minmax(0, 440px);
    justify-content: center;
    padding: 22px 20px 32px;
    gap: 30px;
    min-height: auto;
  }
  .workspace-preview,
  .login-benefits,
  .login-description,
  .login-eyebrow {
    display: none;
  }
  .login-intro h1 {
    font-size: 28px;
  }
  .login-masthead {
    padding: 22px 20px;
  }
  .login-tools > span {
    display: none;
  }
  .login-footer {
    padding-inline: 20px;
    flex-wrap: wrap;
  }
}
</style>
