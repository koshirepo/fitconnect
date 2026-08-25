import { api } from "./client";
import type { ApiResponse } from "@/types/api";

export const uploadsApi = {
  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<ApiResponse<{ url: string }>>("/uploads/logo", formData);
  },

  uploadImage: (file: File) => uploadsApi.uploadLogo(file),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<ApiResponse<{ url: string }>>("/uploads/avatar", formData);
  },

  uploadProductPhoto: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<ApiResponse<{ url: string }>>("/uploads/product-photo", formData);
  },
};
