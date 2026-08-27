import { computed, ref } from "vue";
import { defineStore } from "pinia";

import type { AuthUser, LoginRequest, LoginResponse, Permission } from "@admin-x/shared";
import { hasPermission } from "@admin-x/shared";

import { authApi } from "@/api/auth";
import { clearReauthenticationToken, setReauthenticationToken } from "@/api/http";

const TOKEN_KEY = "admin-x:token";
const USER_KEY = "admin-x:user";
const LOGOUT_SYNC_KEY = "admin-x:logout-sync";

export const useAuthStore = defineStore("auth", () => {
  clearLegacyPersistentCredentials();
  const credentialStorage = getCredentialStorage();
  const token = ref(credentialStorage?.getItem(TOKEN_KEY) ?? "");
  const user = ref<AuthUser | null>(readUser());
  const loginLoading = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value));
  const can = (permission: Permission) =>
    user.value ? hasPermission(user.value.role, permission) : false;

  function restore() {
    token.value = credentialStorage?.getItem(TOKEN_KEY) ?? "";
    user.value = readUser();
  }

  async function login(payload: LoginRequest): Promise<LoginResponse> {
    loginLoading.value = true;
    try {
      clearReauthenticationToken();
      const result = await authApi.login(payload);
      setSession(result);
      return result;
    } finally {
      loginLoading.value = false;
    }
  }

  function setSession(result: LoginResponse) {
    clearReauthenticationToken();
    token.value = result.token;
    user.value = result.user;
    credentialStorage?.setItem(TOKEN_KEY, result.token);
    credentialStorage?.setItem(USER_KEY, JSON.stringify(result.user));
    clearLegacyPersistentCredentials();
  }

  async function reauthenticate(currentPassword: string) {
    const result = await authApi.reauthenticate(currentPassword);
    setReauthenticationToken(result.token);
    return result;
  }

  function updateUser(nextUser: AuthUser) {
    user.value = nextUser;
    credentialStorage?.setItem(USER_KEY, JSON.stringify(nextUser));
  }

  function clearSession(broadcast = true) {
    clearReauthenticationToken();
    token.value = "";
    user.value = null;
    credentialStorage?.removeItem(TOKEN_KEY);
    credentialStorage?.removeItem(USER_KEY);
    if (broadcast) {
      localStorage.setItem(LOGOUT_SYNC_KEY, String(Date.now()));
    }
  }

  async function logout() {
    try {
      if (token.value) {
        await authApi.logout();
      }
    } finally {
      clearSession();
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === LOGOUT_SYNC_KEY) {
        clearSession(false);
      }
    });
  }

  return {
    can,
    clearSession,
    isAuthenticated,
    login,
    loginLoading,
    logout,
    reauthenticate,
    restore,
    setSession,
    token,
    updateUser,
    user,
  };
});

function readUser(): AuthUser | null {
  const rawUser = getCredentialStorage()?.getItem(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    getCredentialStorage()?.removeItem(USER_KEY);
    return null;
  }
}

function getCredentialStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function clearLegacyPersistentCredentials() {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
