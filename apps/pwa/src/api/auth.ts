import { api } from "./client";
import type { AuthResponse, TokenRefreshResponse, User, ApiResponse } from "@/types/api";

export const authApi = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<AuthResponse>>("/auth/login", {
      email,
      password,
    }),

  refresh: (refreshToken: string) =>
    api.post<ApiResponse<TokenRefreshResponse>>("/auth/refresh", {
      refreshToken,
    }),

  logout: (refreshToken: string) => api.post("/auth/logout", { refreshToken }),

  me: () => api.get<ApiResponse<{ user: User }>>("/auth/me"),

  createPlatformUser: (data: {
    name: string;
    email: string;
    phone: string;
    role: "SUPER_ADMIN" | "SUPPORT";
  }) =>
    api.post<ApiResponse<{ user: User; generatedPassword: string }>>("/auth/platform-users", data),

  forgotPassword: (email: string) =>
    api.post<ApiResponse<{ message: string }>>("/auth/forgot-password", { email }),

  resetPassword: (token: string, password: string) =>
    api.post<ApiResponse<{ message: string }>>("/auth/reset-password", { token, password }),
};
