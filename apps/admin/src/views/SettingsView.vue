<script setup lang="ts">
import { ref } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { Bell, Check, Lock, Monitor, Setting } from "@element-plus/icons-vue";

const route = useRoute();
const activeTab = ref(route.query.view === "security" ? "security" : "general");
const emailNotification = ref(true);
const weeklyReport = ref(true);
const compactMode = ref(false);

function saveSettings() {
  ElMessage.success("设置已保存");
}
</script>

<template>
  <div class="settings-page">
    <div class="page-heading">
      <div>
        <p class="page-kicker">PREFERENCES</p>
        <h1>系统设置</h1>
        <p class="page-description">自定义工作台体验和系统通知偏好。</p>
      </div>
      <el-button type="primary" @click="saveSettings">保存设置</el-button>
    </div>

    <el-card class="settings-card" shadow="never">
      <el-tabs v-model="activeTab" tab-position="left">
        <el-tab-pane name="general">
          <template #label
            ><span class="settings-tab"
              ><el-icon><Setting /></el-icon>基础设置</span
            ></template
          >
          <div class="settings-section">
            <div class="settings-section__heading">
              <h2>工作台偏好</h2>
              <p>调整工作台的显示方式和常用行为。</p>
            </div>
            <div class="setting-row">
              <div>
                <strong>紧凑模式</strong><span>减少表格和卡片之间的留白，适合高密度操作。</span>
              </div>
              <el-switch v-model="compactMode" />
            </div>
            <div class="setting-row">
              <div><strong>自动刷新数据</strong><span>每 5 分钟自动刷新工作台统计数据。</span></div>
              <el-switch :model-value="true" disabled />
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane name="notifications">
          <template #label
            ><span class="settings-tab"
              ><el-icon><Bell /></el-icon>通知设置</span
            ></template
          >
          <div class="settings-section">
            <div class="settings-section__heading">
              <h2>通知偏好</h2>
              <p>选择你希望接收的业务动态提醒。</p>
            </div>
            <div class="setting-row">
              <div><strong>邮件通知</strong><span>接收重要系统事件和安全提醒。</span></div>
              <el-switch v-model="emailNotification" />
            </div>
            <div class="setting-row">
              <div><strong>周报摘要</strong><span>每周一接收上周业务数据摘要。</span></div>
              <el-switch v-model="weeklyReport" />
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane name="security">
          <template #label
            ><span class="settings-tab"
              ><el-icon><Lock /></el-icon>安全设置</span
            ></template
          >
          <div class="settings-section">
            <div class="settings-section__heading">
              <h2>账号安全</h2>
              <p>保护工作区和成员数据的安全。</p>
            </div>
            <div class="security-item">
              <span class="security-item__icon"
                ><el-icon><Lock /></el-icon
              ></span>
              <div><strong>登录密码</strong><span>建议定期更新登录密码</span></div>
              <el-button text type="primary">修改密码</el-button>
            </div>
            <div class="security-item">
              <span class="security-item__icon"
                ><el-icon><Monitor /></el-icon
              ></span>
              <div><strong>登录记录</strong><span>当前账号的最近登录活动</span></div>
              <el-button text type="primary">查看记录</el-button>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane name="about">
          <template #label
            ><span class="settings-tab"
              ><el-icon><Check /></el-icon>关于项目</span
            ></template
          >
          <div class="settings-section about-section">
            <div class="about-logo">AX</div>
            <h2>Admin X</h2>
            <p>Vue + Vite+ + NestJS 全栈管理后台</p>
            <el-tag type="success" effect="plain">v0.1.0</el-tag>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 1100px;
  margin: 0 auto;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: var(--ax-page-heading-gap);
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

.settings-card :deep(.el-card__body) {
  padding: 0;
}

.settings-card :deep(.el-tabs) {
  min-height: 490px;
}

.settings-card :deep(.el-tabs__header) {
  width: 190px;
  margin-right: 0;
  padding: 18px 12px;
  border-right: 1px solid var(--ax-line-soft);
}

.settings-card :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.settings-card :deep(.el-tabs__active-bar) {
  display: none;
}

.settings-card :deep(.el-tabs__item) {
  justify-content: flex-start;
  height: 42px;
  margin-bottom: 4px;
  padding: 0 12px !important;
  color: var(--ax-muted);
  font-size: 12px;
  border-radius: 7px;
}

.settings-card :deep(.el-tabs__item:hover),
.settings-card :deep(.el-tabs__item.is-active) {
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
}

.settings-card :deep(.el-tabs__content) {
  padding: 34px 40px;
}

.settings-tab {
  display: flex;
  align-items: center;
  gap: 9px;
}

.settings-section {
  max-width: 680px;
}

.settings-section__heading {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--ax-line-soft);
}

.settings-section__heading h2,
.about-section h2 {
  margin: 0;
  color: var(--ax-content);
  font-size: 16px;
}

.settings-section__heading p,
.about-section p {
  margin: 7px 0 0;
  color: var(--ax-muted);
  font-size: 11px;
}

.setting-row,
.security-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 0;
  border-bottom: 1px solid var(--ax-line-soft);
}

.setting-row > div,
.security-item > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.setting-row strong,
.security-item strong {
  color: var(--ax-content);
  font-size: 12px;
}

.setting-row span,
.security-item span {
  color: var(--ax-muted);
  font-size: 11px;
}

.security-item {
  justify-content: flex-start;
}

.security-item > div {
  flex: 1;
}

.security-item__icon {
  display: grid;
  width: 35px;
  height: 35px;
  place-items: center;
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
  border-radius: 8px;
}

.security-item .el-button {
  font-size: 11px;
}

.about-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding-top: 32px;
}

.about-logo {
  display: grid;
  width: 54px;
  height: 54px;
  place-items: center;
  color: #fff;
  font-size: 17px;
  font-weight: 800;
  background: linear-gradient(135deg, #8c7cf2, #5744d8);
  border-radius: 16px;
  box-shadow: 0 8px 20px rgb(98 77 225 / 25%);
}

@media (max-width: 700px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .settings-card :deep(.el-tabs__header) {
    width: 125px;
  }

  .settings-card :deep(.el-tabs__content) {
    padding: 25px 20px;
  }

  .settings-card :deep(.el-tabs__item) {
    padding: 0 8px !important;
  }
}
</style>
