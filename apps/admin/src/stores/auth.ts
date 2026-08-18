import { computed, ref } from "vue";
import { defineStore } from "pinia";

import type { AuthUser, LoginRequest, LoginResponse, Permission } from "@admin-x/shared";
import { hasPermission } from "@admin-x/shared";

import { authApi } from "@/api/auth";

const TOKEN_KEY = "admin-x:token";
const USER_KEY = "admin-x:user";

export const useAuthStore = defineStore("auth", () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? "");
  const user = ref<AuthUser | null>(readUser());
  const loginLoading = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value));
  const can = (permission: Permission) =>
    user.value ? hasPermission(user.value.role, permission) : false;

  function restore() {
    token.value = localStorage.getItem(TOKEN_KEY) ?? "";
    user.value = readUser();
  }

  async function login(payload: LoginRequest) {
    loginLoading.value = true;
    try {
      const result = await authApi.login(payload);
      setSession(result);
    } finally {
      loginLoading.value = false;
    }
  }

  function setSession(result: LoginResponse) {
    token.value = result.token;
    user.value = result.user;
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  }

  function updateUser(nextUser: AuthUser) {
    user.value = nextUser;
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  }

  function logout() {
    token.value = "";
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  return {
    can,
    isAuthenticated,
    login,
    loginLoading,
    logout,
    restore,
    setSession,
    token,
    updateUser,
    user,
  };
});

function readUser(): AuthUser | null {
  const rawUser = localStorage.getItem(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}
