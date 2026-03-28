import { api } from "./client";
import type { ApiResponse } from "@/types/api";

export const uploadsApi = {
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<ApiResponse<{ url: string }>>("/uploads/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  uploadAvatar: (file: File) => uploadsApi.uploadImage(file),

  uploadProductPhoto: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<ApiResponse<{ url: string }>>("/uploads/product-photo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
