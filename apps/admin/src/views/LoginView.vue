<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { ArrowRight, Lock, Message, User } from "@element-plus/icons-vue";

import type { LoginRequest, SetupAdminRequest } from "@admin-x/shared";
import { getAccountPasswordPolicyError, getErrorMessage } from "@admin-x/shared";

import { authApi } from "@/api/auth";
import ThemeToggleButton from "@/components/ThemeToggleButton.vue";
import { useAuthStore } from "@/stores/auth";

type SetupForm = SetupAdminRequest & { confirmPassword: string };

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const formRef = ref<FormInstance>();
const setupFormRef = ref<FormInstance>();
const checkingSetup = ref(true);
const needsSetup = ref(false);
const setupLoading = ref(false);
const form = reactive<LoginRequest>({
  password: "",
  username: "",
});
const setupForm = reactive<SetupForm>({
  confirmPassword: "",
  displayName: "",
  email: "",
  password: "",
  username: "",
});

const loginRules: FormRules<LoginRequest> = {
  password: [
    { message: "请输入密码", required: true, trigger: "blur" },
    { min: 6, message: "密码长度不能少于 6 位", trigger: "blur" },
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
  username: [
    { message: "请输入用户名", required: true, trigger: "blur" },
    { min: 3, message: "用户名至少 3 个字符", trigger: "blur" },
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

async function redirectToApp() {
  const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/dashboard";
  await router.push(redirect);
}

async function handleLogin() {
  if (!formRef.value) {
    return;
  }

  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  try {
    await authStore.login(form);
    await redirectToApp();
    ElMessage.success("欢迎回来，已进入 Admin X 管理后台");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "登录失败，请检查账号或密码"));
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
      username: setupForm.username,
    });
    authStore.setSession(result);
    await redirectToApp();
    ElMessage.success("首位管理员创建成功，已进入 Admin X 管理后台");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "初始化失败，请稍后重试"));
  } finally {
    setupLoading.value = false;
  }
}

onMounted(() => {
  void loadSetupStatus();
});
</script>

<template>
  <div class="login-page">
    <div class="login-page__decoration login-page__decoration--one"></div>
    <div class="login-page__decoration login-page__decoration--two"></div>
    <div class="login-page__grid"></div>
    <ThemeToggleButton class="login-theme-toggle" />

    <section class="login-intro">
      <div class="login-brand">
        <div class="brand-mark">AX</div>
        <span>Admin X</span>
      </div>
      <div class="login-intro__content">
        <p class="eyebrow">ADMIN CONSOLE</p>
        <h1>让每一项工作，<br /><span>都能清晰、高效地完成。</span></h1>
        <p class="login-intro__description">
          面向团队的 Admin X 管理后台，统一管理成员、数据和系统设置。
        </p>
        <div class="login-highlights">
          <div>
            <strong>工作台</strong>
            <span>快速掌握系统概览</span>
          </div>
          <div>
            <strong>用户管理</strong>
            <span>维护成员与角色</span>
          </div>
          <div>
            <strong>系统设置</strong>
            <span>按需配置工作台</span>
          </div>
        </div>
      </div>
      <div class="login-intro__footer">© 2026 Admin X 管理后台</div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="login-card__heading">
          <p class="eyebrow">{{ needsSetup ? "INITIAL ADMIN SETUP" : "ACCOUNT ACCESS" }}</p>
          <h2>{{ needsSetup ? "创建首位管理员" : "登录管理中心" }}</h2>
          <p>
            {{
              needsSetup
                ? "首次使用，请创建首位管理员账号。"
                : "使用管理员为你创建的账号，继续管理工作台。"
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
              placeholder="至少 12 位，需满足复杂度要求"
            >
              <template #prefix
                ><el-icon> <Lock /> </el-icon
              ></template>
            </el-input>
          </el-form-item>
          <p class="password-policy-hint">
            管理员密码至少 12 位，并包含数字、大小写字母、特殊字符中的至少三类。
          </p>
          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input
              v-model="setupForm.confirmPassword"
              size="large"
              type="password"
              show-password
              placeholder="再次输入密码"
            >
              <template #prefix
                ><el-icon> <Lock /> </el-icon
              ></template>
            </el-input>
          </el-form-item>
          <el-button
            class="login-submit"
            type="primary"
            size="large"
            native-type="submit"
            :loading="setupLoading"
          >
            创建管理员并进入管理中心
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
            <el-input v-model="form.username" size="large" placeholder="请输入账号">
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
              placeholder="请输入密码"
            >
              <template #prefix
                ><el-icon> <Lock /> </el-icon
              ></template>
            </el-input>
          </el-form-item>
          <el-button
            class="login-submit"
            type="primary"
            size="large"
            native-type="submit"
            :loading="authStore.loginLoading"
          >
            进入管理中心
            <el-icon>
              <ArrowRight />
            </el-icon>
          </el-button>
        </el-form>
      </div>
      <p class="login-panel__tip">
        {{ needsSetup ? "管理员账号只能初始化一次" : "账号由管理员创建，如需访问请联系系统管理员" }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  display: flex;
  min-height: 100vh;
  overflow: hidden;
  color: #172033;
  background: #f4f6fb;
}

.login-theme-toggle {
  position: absolute;
  top: 28px;
  right: 28px;
  z-index: 5;
  width: 40px;
  height: 40px;
}

.login-page__grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgb(103 85 232 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(103 85 232 / 4%) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: linear-gradient(90deg, #000 0%, transparent 74%);
}

.login-page__decoration {
  position: absolute;
  pointer-events: none;
  border-radius: 50%;
  filter: blur(2px);
}

.login-page__decoration--one {
  top: -220px;
  left: 22%;
  width: 510px;
  height: 510px;
  background: rgb(103 85 232 / 19%);
  filter: blur(80px);
}

.login-page__decoration--two {
  right: 3%;
  bottom: -260px;
  width: 480px;
  height: 480px;
  background: rgb(57 189 168 / 10%);
  filter: blur(70px);
}

.login-intro {
  position: relative;
  display: flex;
  flex: 1 1 55%;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  padding: 54px clamp(40px, 6vw, 128px) 42px;
  color: #fff;
  background:
    radial-gradient(circle at 58% 42%, rgb(103 85 232 / 18%), transparent 24%),
    linear-gradient(142deg, #121a2d 0%, #101729 58%, #151b34 100%);
  clip-path: polygon(0 0, 93% 0, 100% 50%, 93% 100%, 0 100%);
}

.login-brand,
.login-intro__content,
.login-intro__footer {
  position: relative;
  z-index: 1;
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.login-brand .brand-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  color: #fff;
  font-size: 13px;
  letter-spacing: -0.06em;
  background: linear-gradient(135deg, #7c6af2, #5141d8);
  box-shadow: 0 8px 20px rgb(0 91 188 / 28%);
}

.login-intro__content {
  margin: -40px 0 0;
}

.eyebrow {
  margin: 0 0 15px;
  color: #8c80e9;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.login-intro h1 {
  margin: 0;
  color: #f8f9ff;
  font-size: clamp(36px, 4vw, 62px);
  font-weight: 700;
  line-height: 1.16;
  letter-spacing: -0.065em;
}

.login-intro h1 span {
  color: #978cf4;
}

.login-intro__description {
  max-width: 460px;
  margin: 26px 0 0;
  color: #98a5be;
  font-size: 14px;
  line-height: 1.9;
}

.login-highlights {
  display: flex;
  gap: clamp(22px, 4vw, 52px);
  margin-top: 52px;
}

.login-highlights div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.login-highlights strong {
  color: #fff;
  font-size: 24px;
  letter-spacing: -0.04em;
}

.login-highlights span {
  color: #75829d;
  font-size: 11px;
}

.login-intro__footer {
  color: #62708d;
  font-size: 10px;
}

.login-panel {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 1 1 45%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 420px;
  padding: 52px 7vw 32px 4vw;
}

.login-card {
  width: min(100%, 420px);
  padding: 42px 44px 38px;
  background: rgb(255 255 255 / 86%);
  border: 1px solid rgb(255 255 255 / 94%);
  border-radius: 18px;
  box-shadow: 0 26px 70px rgb(41 54 95 / 11%);
  backdrop-filter: blur(15px);
}

.login-card__heading h2 {
  margin: 0;
  color: #1b2537;
  font-size: 28px;
  letter-spacing: -0.05em;
}

.login-card__heading > p:last-child {
  margin: 9px 0 32px;
  color: #8b96a8;
  font-size: 12px;
}

.login-card__heading .eyebrow {
  margin-bottom: 9px;
  color: #6755e8;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 22px;
}

.password-policy-hint {
  margin: -10px 0 22px;
  color: #8b96a8;
  font-size: 11px;
  line-height: 1.6;
}

.login-form :deep(.el-form-item__label) {
  height: auto;
  padding-bottom: 8px;
  color: #465269;
  font-size: 12px;
  font-weight: 600;
}

.login-form :deep(.el-input__wrapper) {
  min-height: 46px;
  background: #f9fafe;
  border: 1px solid #e7ebf3;
  border-radius: 8px;
  box-shadow: none;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: #9d94ee;
  box-shadow: 0 0 0 3px rgb(103 85 232 / 11%);
}

.login-form :deep(.el-input__inner) {
  color: #27344a;
  font-size: 13px;
}

.login-form :deep(.el-input__prefix-inner) {
  color: #a4adbf;
}

html.dark .login-form :deep(.el-form-item__label) {
  color: var(--ax-content);
}

html.dark .password-policy-hint {
  color: var(--ax-muted);
}

html.dark .login-form :deep(.el-input__wrapper) {
  background: var(--ax-surface-muted);
  border-color: var(--ax-line);
  box-shadow: 0 0 0 1px var(--ax-line) inset;
}

html.dark .login-form :deep(.el-input__wrapper.is-focus) {
  border-color: var(--ax-primary);
  box-shadow: 0 0 0 3px rgb(155 141 245 / 20%);
}

html.dark .login-form :deep(.el-input__inner) {
  color: var(--ax-text);
  caret-color: var(--ax-primary);
}

html.dark .login-form :deep(.el-input__inner::placeholder) {
  color: var(--ax-muted);
  opacity: 1;
}

html.dark .login-form :deep(.el-input__prefix-inner),
html.dark .login-form :deep(.el-input__suffix-inner) {
  color: var(--ax-muted);
}

.login-form__options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -4px 0 24px;
}

.login-form__options :deep(.el-checkbox__label) {
  color: #8a95a8;
  font-size: 11px;
}

.login-form__options .el-button {
  height: auto;
  padding: 0;
  font-size: 11px;
}

.login-submit {
  width: 100%;
  height: 46px;
  border: 0;
  border-radius: 8px;
  box-shadow: 0 8px 18px rgb(103 85 232 / 24%);
}

.login-submit .el-icon {
  margin-left: 8px;
}

.setup-loading {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  color: #8b96a8;
  font-size: 12px;
}

.setup-loading p {
  margin: 0;
}

.login-panel__tip {
  margin: 18px 0 0;
  color: #9ba6b6;
  font-size: 10px;
}

@media (max-width: 980px) {
  .login-intro {
    flex-basis: 46%;
    padding-inline: 48px;
  }

  .login-panel {
    min-width: 390px;
    padding-right: 34px;
  }

  .login-intro__content {
    margin-top: 0;
  }

  .login-intro h1 {
    font-size: 40px;
  }
}

@media (max-width: 720px) {
  .login-page {
    display: block;
    overflow: auto;
  }

  .login-intro {
    display: block;
    min-height: auto;
    padding: 30px 28px 24px;
    clip-path: none;
  }

  .login-intro__content {
    margin: 58px 0 30px;
  }

  .login-intro h1 {
    font-size: 35px;
  }

  .login-intro__description,
  .login-highlights {
    display: none;
  }

  .login-intro__footer {
    display: none;
  }

  .login-panel {
    min-width: 0;
    padding: 30px 20px 42px;
  }

  .login-card {
    padding: 32px 25px 28px;
  }
}
</style>
