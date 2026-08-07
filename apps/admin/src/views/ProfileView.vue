<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowRight, Lock, Setting, UserFilled } from "@element-plus/icons-vue";

import type { UserRole } from "@admin-x/shared";

import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const profile = computed(() => authStore.user);
const initials = computed(() => profile.value?.displayName.slice(0, 1) ?? "A");
const roleName = computed(() => roleLabel(profile.value?.role));
const lastLoginLabel = computed(() => formatDate(profile.value?.lastLoginAt));

function roleLabel(role?: UserRole) {
  return (
    {
      admin: "管理员",
      operator: "运营成员",
      "super-admin": "超级管理员",
    } satisfies Record<UserRole, string>
  )[role ?? "operator"];
}

function formatDate(value?: string) {
  if (!value) {
    return "暂无记录";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "暂无记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function openSecuritySettings() {
  await router.push({ name: "settings", query: { view: "security" } });
}

function showEditNotice() {
  ElMessage.info("资料编辑功能将在接入成员服务后开放");
}
</script>

<template>
  <div class="profile-page">
    <div class="page-heading">
      <div>
        <p class="page-kicker">ACCOUNT</p>
        <h1>个人资料</h1>
        <p class="page-description">查看你的工作区身份和账号信息。</p>
      </div>
      <el-button type="primary" plain @click="showEditNotice">编辑资料</el-button>
    </div>

    <div class="profile-grid">
      <el-card class="profile-card profile-card--identity" shadow="never">
        <div class="profile-hero">
          <el-avatar :size="76" class="profile-avatar">{{ initials }}</el-avatar>
          <div>
            <p class="profile-eyebrow">WORKSPACE MEMBER</p>
            <h2>{{ profile?.displayName ?? "管理员" }}</h2>
            <span>@{{ profile?.username ?? "admin" }}</span>
          </div>
          <el-tag type="success" effect="light">{{ roleName }}</el-tag>
        </div>

        <div class="profile-details">
          <div class="profile-detail">
            <span class="profile-detail__icon"
              ><el-icon><UserFilled /></el-icon
            ></span>
            <div>
              <small>显示名称</small>
              <strong>{{ profile?.displayName ?? "管理员" }}</strong>
            </div>
          </div>
          <div class="profile-detail">
            <span class="profile-detail__icon"
              ><el-icon><Setting /></el-icon
            ></span>
            <div>
              <small>账号角色</small>
              <strong>{{ roleName }}</strong>
            </div>
          </div>
          <div class="profile-detail">
            <span class="profile-detail__icon"
              ><el-icon><Lock /></el-icon
            ></span>
            <div>
              <small>最近登录</small>
              <strong>{{ lastLoginLabel }}</strong>
            </div>
          </div>
        </div>
      </el-card>

      <el-card class="profile-card profile-card--contact" shadow="never">
        <div class="profile-card__heading">
          <div>
            <h2>联系信息</h2>
            <p>用于工作区通知和账号识别。</p>
          </div>
        </div>
        <div class="profile-contact-list">
          <div class="profile-contact-row">
            <span>用户名</span>
            <strong>{{ profile?.username ?? "admin" }}</strong>
          </div>
          <div class="profile-contact-row">
            <span>邮箱地址</span>
            <strong>{{ profile?.email ?? "未绑定邮箱" }}</strong>
          </div>
          <div class="profile-contact-row">
            <span>成员编号</span>
            <code>{{ profile?.id ?? "-" }}</code>
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
        <p>定期检查密码和登录设备，保护工作区数据安全。</p>
      </div>
      <el-button text type="primary" @click="openSecuritySettings">
        前往安全设置 <el-icon><ArrowRight /></el-icon>
      </el-button>
    </el-card>
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
  font-size: 12px;
}

.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 18px;
}

.profile-card {
  min-height: 290px;
}

.profile-card :deep(.el-card__body) {
  height: 100%;
  padding: 28px;
}

.profile-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 26px;
  border-bottom: 1px solid var(--ax-line-soft);
}

.profile-avatar {
  flex: 0 0 auto;
  color: #fff;
  font-size: 25px;
  font-weight: 700;
  background: linear-gradient(135deg, #a99cf8, #6755e8);
}

.profile-hero > div {
  min-width: 0;
  flex: 1;
}

.profile-eyebrow {
  margin-bottom: 6px;
  color: var(--ax-primary);
  font-size: 9px;
}

.profile-hero h2,
.profile-card__heading h2,
.profile-security-card h2 {
  margin: 0;
  color: var(--ax-heading);
  font-size: 17px;
  font-weight: 700;
}

.profile-hero > div > span,
.profile-card__heading p,
.profile-security-card p {
  color: var(--ax-muted);
  font-size: 11px;
}

.profile-hero > div > span {
  display: block;
  margin-top: 5px;
}

.profile-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  padding-top: 24px;
}

.profile-detail {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
}

.profile-detail__icon,
.profile-security-card__icon {
  display: grid;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--ax-primary);
  background: var(--ax-primary-soft);
  border-radius: 8px;
}

.profile-detail div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.profile-detail small,
.profile-detail strong,
.profile-contact-row span,
.profile-contact-row strong,
.profile-contact-row code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-detail small,
.profile-contact-row span {
  color: var(--ax-muted);
  font-size: 10px;
}

.profile-detail strong,
.profile-contact-row strong,
.profile-contact-row code {
  color: var(--ax-content);
  font-size: 12px;
  font-weight: 600;
}

.profile-card__heading {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--ax-line-soft);
}

.profile-card__heading p {
  margin: 7px 0 0;
}

.profile-contact-list {
  display: flex;
  flex-direction: column;
}

.profile-contact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 0;
  border-bottom: 1px solid var(--ax-line-soft);
}

.profile-contact-row:last-child {
  border-bottom: 0;
}

.profile-contact-row code {
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
}

.profile-security-card {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 18px;
}

.profile-security-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 14px;
  padding: 20px 24px;
}

.profile-security-card > div:nth-child(2) {
  flex: 1;
}

.profile-security-card p {
  margin: 6px 0 0;
}

.profile-security-card .el-button {
  flex: 0 0 auto;
  font-size: 11px;
}

@media (max-width: 760px) {
  .page-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .profile-grid {
    grid-template-columns: 1fr;
  }

  .profile-details {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .profile-hero {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .profile-hero .el-tag {
    width: 100%;
  }

  .profile-security-card :deep(.el-card__body) {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .profile-security-card .el-button {
    width: 100%;
    justify-content: flex-start;
    padding-left: 0;
  }
}
</style>
