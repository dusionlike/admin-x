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
        <p class="page-kicker">SYSTEM CONFIGURATION</p>
        <h1>系统配置</h1>
        <p class="page-description">系统管理员负责配置基础运行服务，不直接决定安全策略是否启用。</p>
      </div>
      <el-tag :type="settings.enabled ? 'success' : 'info'" effect="light">
        邮箱 MFA {{ settings.enabled ? "已启用" : "默认关闭" }}
      </el-tag>
    </div>

    <el-card class="responsibility-card" shadow="never">
      <div class="responsibility-card__item">
        <el-tag type="primary" effect="plain">系统管理员</el-tag>
        <span>填写 SMTP 主机、端口、账号和发件地址，并发送测试邮件。</span>
      </div>
      <div class="responsibility-card__item">
        <el-tag type="warning" effect="plain">安全管理员</el-tag>
        <span>在“安全策略”中根据组织要求启用或停用邮箱 MFA 登录策略。</span>
      </div>
    </el-card>

    <el-card class="config-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <strong>邮箱 MFA 发信服务</strong>
            <span>SMTP 密码不会回显，留空表示保留当前已保存的密码。</span>
          </div>
          <div class="card-actions">
            <el-tag :type="settings.configured ? 'success' : 'warning'" effect="plain">
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
            <el-button type="primary" :loading="saving" @click="saveSettings">保存配置</el-button>
          </div>
        </div>
      </template>

      <el-form
        ref="formRef"
        class="config-form"
        :model="transport"
        :rules="rules"
        label-position="top"
      >
        <div class="config-form__grid">
          <el-form-item label="SMTP 主机" prop="smtpHost">
            <el-input v-model="transport.smtpHost" placeholder="例如 smtp.example.com" />
          </el-form-item>
          <el-form-item label="SMTP 端口">
            <el-input-number v-model="transport.smtpPort" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="加密连接">
            <el-switch
              v-model="transport.smtpSecure"
              active-text="TLS/SSL"
              inactive-text="STARTTLS"
            />
          </el-form-item>
          <el-form-item label="SMTP 用户名">
            <el-input v-model="transport.smtpUser" autocomplete="username" placeholder="可选" />
          </el-form-item>
          <el-form-item label="SMTP 密码">
            <el-input
              v-model="transport.smtpPassword"
              type="password"
              show-password
              autocomplete="new-password"
              :placeholder="settings.smtpPasswordSet ? '已配置，留空保持不变' : '请输入 SMTP 密码'"
            />
          </el-form-item>
          <el-form-item label="发件邮箱" prop="fromEmail">
            <el-input v-model="transport.fromEmail" placeholder="例如 no-reply@example.com" />
          </el-form-item>
          <el-form-item label="发件人名称" prop="fromName">
            <el-input v-model="transport.fromName" placeholder="Admin X" />
          </el-form-item>
        </div>
      </el-form>
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

.responsibility-card,
.config-card {
  margin-bottom: 16px;
}

.responsibility-card :deep(.el-card__body) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.responsibility-card__item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ax-content);
  font-size: 12px;
  line-height: 1.7;
}

.card-heading,
.card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-heading {
  justify-content: space-between;
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

.config-form {
  padding-top: 2px;
}

.config-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 22px;
}

.config-form__grid :deep(.el-input-number) {
  width: 100%;
}

@media (max-width: 800px) {
  .page-heading,
  .card-heading,
  .card-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .card-actions {
    align-items: stretch;
    width: 100%;
  }

  .responsibility-card :deep(.el-card__body),
  .config-form__grid {
    grid-template-columns: 1fr;
  }
}
</style>
