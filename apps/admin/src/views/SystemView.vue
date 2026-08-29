<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";

import type { EmailMfaSettings, UpdateEmailMfaTransportSettings } from "@admin-x/shared";
import { getErrorMessage } from "@admin-x/shared";

import { securityApi } from "@/api/security";
import { useAuthStore } from "@/stores/auth";

const authStore = useAuthStore();
const formRef = ref<FormInstance>();
const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const settings = reactive<EmailMfaSettings>({
  configured: false,
  enabled: false,
  fromEmail: "",
  fromName: "Admin X",
  smtpHost: "",
  smtpPasswordSet: false,
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
});
const transport = reactive<UpdateEmailMfaTransportSettings>({
  fromEmail: "",
  fromName: "Admin X",
  smtpHost: "",
  smtpPassword: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
});

const rules: FormRules<UpdateEmailMfaTransportSettings> = {
  fromEmail: [
    { message: "请输入发件邮箱", required: true, trigger: "blur" },
    { message: "请输入有效的邮箱地址", type: "email", trigger: "blur" },
  ],
  fromName: [{ message: "请输入发件人名称", required: true, trigger: "blur" }],
  smtpHost: [{ message: "请输入 SMTP 主机", required: true, trigger: "blur" }],
};

function applySettings(value: EmailMfaSettings) {
  Object.assign(settings, value);
  Object.assign(transport, {
    fromEmail: value.fromEmail,
    fromName: value.fromName,
    smtpHost: value.smtpHost,
    smtpPassword: "",
    smtpPort: value.smtpPort,
    smtpSecure: value.smtpSecure,
    smtpUser: value.smtpUser,
  });
}

async function loadSettings() {
  loading.value = true;
  try {
    applySettings(await securityApi.getEmailMfaSettings());
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "系统配置加载失败"));
  } finally {
    loading.value = false;
  }
}

async function confirmSensitiveAction() {
  try {
    const result = await ElMessageBox.prompt(
      "请输入当前登录密码，以确认修改邮件服务配置。验证令牌仅在当前页面短时有效。",
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

async function saveSettings() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) {
    return;
  }
  saving.value = true;
  try {
    if (!(await confirmSensitiveAction())) {
      return;
    }
    const result = await securityApi.updateEmailMfaTransport({
      fromEmail: transport.fromEmail,
      fromName: transport.fromName,
      smtpHost: transport.smtpHost,
      smtpPassword: transport.smtpPassword || undefined,
      smtpPort: transport.smtpPort,
      smtpSecure: transport.smtpSecure,
      smtpUser: transport.smtpUser,
    });
    applySettings(result);
    ElMessage.success("邮件服务配置已保存");
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "邮件服务配置保存失败"));
  } finally {
    saving.value = false;
  }
}

async function testDelivery() {
  testing.value = true;
  try {
    if (!(await confirmSensitiveAction())) {
      return;
    }
    const result = await securityApi.testEmailMfa();
    ElMessage.success(`测试邮件已发送至 ${result.maskedEmail}`);
  } catch (error: unknown) {
    ElMessage.error(getErrorMessage(error, "测试邮件发送失败"));
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  void loadSettings();
});
</script>

<template>
  <div class="system-page" v-loading="loading">
    <div class="page-heading">
      <div>
        <h1>系统配置</h1>
        <p class="page-description">集中管理系统运行所需的服务与基础参数。</p>
      </div>
      <el-tag :type="settings.enabled ? 'success' : 'info'" effect="light">
        邮箱验证 {{ settings.enabled ? "已启用" : "默认关闭" }}
      </el-tag>
    </div>

    <el-card class="config-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <div class="card-heading__copy">
            <strong>系统服务配置</strong>
            <span>管理系统运行所需的外部服务参数，后续可继续扩展其他配置项。</span>
          </div>
          <el-button type="primary" :loading="saving" @click="saveSettings">保存配置</el-button>
        </div>
      </template>

      <section class="system-config-section">
        <div class="system-config-section__heading">
          <div class="system-config-section__copy">
            <strong>邮箱验证发信服务</strong>
          </div>
          <div class="system-config-section__actions">
            <el-tag
              class="config-status-tag"
              :type="settings.configured ? 'success' : 'warning'"
              effect="plain"
            >
              {{ settings.configured ? "配置完整" : "待配置" }}
            </el-tag>
            <el-button
              type="success"
              plain
              :loading="testing"
              :disabled="!settings.configured"
              @click="testDelivery"
            >
              发送测试邮件
            </el-button>
          </div>
        </div>

        <el-form
          ref="formRef"
          class="config-form"
          :model="transport"
          :rules="rules"
          label-position="top"
        >
          <el-form-item label="SMTP 主机" prop="smtpHost">
            <el-input v-model="transport.smtpHost" placeholder="例如 smtp.example.com" />
          </el-form-item>
          <el-form-item class="config-form__item--port" label="SMTP 端口">
            <el-input-number
              v-model="transport.smtpPort"
              class="smtp-port-input"
              :min="1"
              :max="65535"
              controls-position="right"
            />
            <span class="config-form__hint">常用端口：587 / 465</span>
          </el-form-item>
          <el-form-item class="config-form__item--secure" label="加密连接">
            <el-switch
              v-model="transport.smtpSecure"
              active-text="TLS/SSL"
              inactive-text="STARTTLS"
            />
            <span class="config-form__hint">按邮件服务商的连接要求选择</span>
          </el-form-item>
          <el-form-item label="SMTP 用户名">
            <el-input v-model="transport.smtpUser" autocomplete="username" placeholder="可选" />
          </el-form-item>
          <el-form-item label="SMTP 密码">
            <el-input
              v-model="transport.smtpPassword"
              type="password"
              show-password
              autocomplete="off"
              :placeholder="settings.smtpPasswordSet ? '已配置，留空保持不变' : '请输入 SMTP 密码'"
            />
          </el-form-item>
          <el-form-item label="发件邮箱" prop="fromEmail">
            <el-input v-model="transport.fromEmail" placeholder="例如 no-reply@example.com" />
          </el-form-item>
          <el-form-item label="发件人名称" prop="fromName">
            <el-input v-model="transport.fromName" placeholder="Admin X" />
          </el-form-item>
        </el-form>
      </section>
    </el-card>
  </div>
</template>

<style scoped>
.system-page {
  max-width: 1200px;
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

.config-card {
  margin-bottom: 16px;
}

.card-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-heading {
  justify-content: space-between;
}

.card-heading__copy {
  min-width: 0;
}

.card-heading__copy strong,
.card-heading__copy span {
  display: block;
}

.card-heading__copy strong {
  color: var(--ax-heading);
  font-size: 14px;
}

.card-heading__copy span {
  margin-top: 5px;
  color: var(--ax-muted);
  font-size: 11px;
}

.system-config-section {
  padding: 2px 0 4px;
}

.system-config-section__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.system-config-section__copy {
  min-width: 0;
}

.system-config-section__copy strong {
  color: var(--ax-heading);
  font-size: 15px;
}

.system-config-section__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.config-status-tag {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  height: 26px;
  padding: 0 10px;
  line-height: 1;
  text-align: center;
  vertical-align: middle;
}

.config-status-tag :deep(.el-tag__content) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  text-align: center;
}

.config-form {
  max-width: 720px;
  padding-top: 0;
}

.config-form :deep(.el-form-item) {
  margin-bottom: 22px;
}

.config-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.config-form__hint {
  color: var(--ax-muted);
  font-size: 11px;
  line-height: 1.5;
}

.config-form__item--port :deep(.el-form-item__content),
.config-form__item--secure :deep(.el-form-item__content) {
  align-items: flex-start;
  flex-direction: column;
  gap: 5px;
}

.config-form__item--port :deep(.el-input-number) {
  width: 160px;
  max-width: 100%;
}

.config-form__item--secure :deep(.el-switch) {
  height: 32px;
}

@media (max-width: 800px) {
  .page-heading,
  .card-heading,
  .system-config-section__heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .system-config-section__actions {
    align-items: stretch;
    width: 100%;
  }

  .system-config-section__actions :deep(.el-button) {
    width: 100%;
    margin: 0;
  }

  .config-status-tag {
    align-self: flex-start;
  }

  .config-form {
    max-width: none;
  }
}
</style>
