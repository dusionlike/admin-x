import { createRouter, createWebHistory } from "vue-router";

import type { Permission } from "@admin-x/shared";

import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { title: "登录", guestOnly: true },
    },
    {
      path: "/",
      component: () => import("@/layouts/AdminLayout.vue"),
      meta: { requiresAuth: true },
      children: [
        {
          path: "",
          redirect: "/dashboard",
        },
        {
          path: "dashboard",
          name: "dashboard",
          component: () => import("@/views/DashboardView.vue"),
          meta: { title: "工作台", requiresAuth: true },
        },
        {
          path: "users",
          name: "users",
          component: () => import("@/views/UsersView.vue"),
          meta: { title: "用户管理", requiresAuth: true, permission: "user:read" },
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("@/views/SettingsView.vue"),
          meta: { title: "系统设置", requiresAuth: true, permission: "system:manage" },
        },
        {
          path: "security",
          name: "security",
          component: () => import("@/views/SecurityView.vue"),
          meta: { title: "安全策略", requiresAuth: true, permission: "security:manage" },
        },
        {
          path: "audit",
          name: "audit",
          component: () => import("@/views/AuditView.vue"),
          meta: { title: "安全审计", requiresAuth: true, permission: "audit:read" },
        },
        {
          path: "profile",
          name: "profile",
          component: () => import("@/views/ProfileView.vue"),
          meta: { title: "个人资料", requiresAuth: true },
        },
      ],
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/NotFoundView.vue"),
      meta: { title: "页面不存在" },
    },
  ],
});

router.afterEach((to) => {
  const title = String(to.meta.title ?? "管理中心");
  document.title = `${title} · Admin X 管理后台`;
});

router.beforeEach((to) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return {
      name: "login",
      query: { redirect: to.fullPath },
    };
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return { name: "dashboard" };
  }

  const permission = to.meta.permission as Permission | undefined;
  if (permission && !authStore.can(permission)) {
    return { name: "dashboard" };
  }

  return true;
});

export default router;
