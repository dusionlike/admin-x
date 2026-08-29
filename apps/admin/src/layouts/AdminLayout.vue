<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  ArrowDown,
  Bell,
  DataAnalysis,
  Document,
  Expand,
  Fold,
  Lock,
  Odometer,
  Setting,
  SwitchButton,
  User,
  UserFilled,
} from "@element-plus/icons-vue";

import ThemeToggleButton from "@/components/ThemeToggleButton.vue";
import { useAuthStore } from "@/stores/auth";
import { getRoleDefinition } from "@admin-x/shared";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const collapsed = ref(false);
const canViewAnalytics = computed(() => authStore.can("analytics:view"));
const canViewUsers = computed(() => authStore.can("user:read"));
const canManageSecurity = computed(() => authStore.can("security:manage"));
const canManageSystem = computed(() => authStore.can("system:manage"));
const canViewAudit = computed(() => authStore.can("audit:read"));
const roleLabel = computed(() => {
  return authStore.user ? getRoleDefinition(authStore.user.role).label : "普通用户";
});

const activeMenu = computed(() => {
  if (route.path.startsWith("/analytics")) {
    return "/analytics";
  }
  if (route.path.startsWith("/users")) {
    return "/users";
  }
  if (route.path.startsWith("/security")) {
    return "/security";
  }
  if (route.path.startsWith("/system")) {
    return "/system";
  }
  if (route.path.startsWith("/audit")) {
    return "/audit";
  }
  if (route.path.startsWith("/profile")) {
    return "";
  }
  return "/dashboard";
});

const pageTitle = computed(() => String(route.meta.title ?? "工作台"));
const unreadNotificationCount = ref(0);

async function handleCommand(command: string) {
  if (command === "profile") {
    await router.push({ name: "profile" });
    return;
  }

  if (command === "logout") {
    await authStore.logout().catch(() => undefined);
    await router.push({ name: "login" });
  }
}

function toggleSidebar() {
  collapsed.value = !collapsed.value;
}

function showNotifications() {
  unreadNotificationCount.value = 0;
  ElMessage.info("暂无新的系统通知");
}
</script>

<template>
  <el-container class="admin-shell">
    <el-aside class="admin-aside" :class="{ 'is-collapsed': collapsed }">
      <div class="brand-block">
        <img class="brand-mark" src="/icon.png" alt="" aria-hidden="true" />
        <div class="brand-copy" :class="{ 'is-hidden': collapsed }" :aria-hidden="collapsed">
          <strong>Admin X</strong>
          <span>运营管理中心</span>
        </div>
      </div>

      <div class="workspace-chip" :class="{ 'is-hidden': collapsed }" :aria-hidden="collapsed">
        <span class="status-dot"></span>
        <span>主工作区</span>
        <span class="workspace-chip__label">标准版</span>
      </div>

      <el-menu class="side-menu" :default-active="activeMenu" :router="true">
        <div
          class="menu-section-title"
          :class="{ 'is-hidden': collapsed }"
          :aria-hidden="collapsed"
        >
          工作台
        </div>
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span class="menu-label">工作台</span>
        </el-menu-item>

        <div
          class="menu-section-title"
          :class="{ 'is-hidden': collapsed }"
          :aria-hidden="collapsed"
        >
          团队管理
        </div>
        <el-menu-item v-if="canViewUsers" index="/users">
          <el-icon><UserFilled /></el-icon>
          <span class="menu-label">用户管理</span>
        </el-menu-item>

        <div
          class="menu-section-title"
          :class="{ 'is-hidden': collapsed }"
          :aria-hidden="collapsed"
        >
          数据与服务
        </div>
        <el-menu-item v-if="canViewAnalytics" index="/analytics">
          <el-icon><DataAnalysis /></el-icon>
          <span class="menu-label">数据分析</span>
        </el-menu-item>
        <el-menu-item v-if="canManageSecurity" index="/security">
          <el-icon><Lock /></el-icon>
          <span class="menu-label">安全策略</span>
        </el-menu-item>
        <el-menu-item v-if="canManageSystem" index="/system">
          <el-icon><Setting /></el-icon>
          <span class="menu-label">系统配置</span>
        </el-menu-item>
        <el-menu-item v-if="canViewAudit" index="/audit">
          <el-icon><Document /></el-icon>
          <span class="menu-label">安全审计</span>
        </el-menu-item>
      </el-menu>

      <div class="aside-footer" :class="{ 'is-hidden': collapsed }" :aria-hidden="collapsed">
        <div class="aside-footer__glow"></div>
        <strong>需要帮助？</strong>
        <span>查看项目使用文档</span>
        <el-button text>打开文档 <span class="arrow-link">↗</span></el-button>
      </div>
    </el-aside>

    <el-container class="main-container">
      <el-header class="topbar" height="72px">
        <div class="topbar__left">
          <el-button
            class="collapse-button"
            text
            :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'"
            :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
            @click="toggleSidebar"
          >
            <el-icon :size="20">
              <Expand v-if="collapsed" />
              <Fold v-else />
            </el-icon>
          </el-button>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>管理后台</el-breadcrumb-item>
            <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="topbar__right">
          <el-button
            class="icon-button"
            text
            :aria-label="unreadNotificationCount > 0 ? '有未读通知' : '通知'"
            @click="showNotifications"
          >
            <el-badge v-if="unreadNotificationCount > 0" is-dot>
              <el-icon :size="19"><Bell /></el-icon>
            </el-badge>
            <el-icon v-else :size="19"><Bell /></el-icon>
          </el-button>
          <ThemeToggleButton class="icon-button" />
          <div class="topbar-divider"></div>
          <el-dropdown trigger="click" @command="handleCommand">
            <button class="user-trigger" type="button">
              <el-avatar :size="36" class="user-avatar" :src="authStore.user?.avatar || undefined">
                {{ authStore.user?.displayName?.slice(0, 1) ?? "A" }}
              </el-avatar>
              <span class="user-trigger__copy">
                <strong>{{ authStore.user?.displayName ?? "管理员" }}</strong>
                <small>{{ roleLabel }}</small>
              </span>
              <el-icon class="user-trigger__arrow"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人资料
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="page-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
