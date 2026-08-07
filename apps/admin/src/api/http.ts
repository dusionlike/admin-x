import axios from "axios";
import type { AxiosRequestConfig } from "axios";

import type { ApiResponse } from "@admin-x/shared";
import { API_PREFIX, unwrapApiResponse } from "@admin-x/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || API_PREFIX;

export const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 12_000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin-x:token");
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const responseMessage = (error.response?.data as { message?: string | string[] } | undefined)
        ?.message;
      if (Array.isArray(responseMessage)) {
        return Promise.reject(new Error(responseMessage.join("、")));
      }
      if (typeof responseMessage === "string" && responseMessage.length > 0) {
        return Promise.reject(new Error(responseMessage));
      }
    }
    return Promise.reject(error);
  },
);

export async function requestData<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<ApiResponse<T>>(config);
  return unwrapApiResponse(response.data);
}
