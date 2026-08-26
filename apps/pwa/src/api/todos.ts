import { api } from "./client";
import type {
  ApiResponse,
  MessageResponse,
  PaginatedResponse,
  Todo,
  CreateTodoPayload,
  UpdateTodoPayload,
} from "@/types/api";

export const todosApi = {
  list: (
    tenantId: string,
    page = 1,
    limit = 20,
    status?: "ALL" | "OPEN" | "COMPLETED",
    search?: string,
  ) =>
    api.get<PaginatedResponse<{ todos: Todo[] }>>(`/tenants/${tenantId}/todos`, {
      params: {
        page,
        limit,
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      },
    }),

  getById: (tenantId: string, todoId: string) =>
    api.get<ApiResponse<{ todo: Todo }>>(`/tenants/${tenantId}/todos/${todoId}`),

  create: (tenantId: string, data: CreateTodoPayload) =>
    api.post<ApiResponse<{ todo: Todo }>>(`/tenants/${tenantId}/todos`, data),

  update: (tenantId: string, todoId: string, data: UpdateTodoPayload) =>
    api.patch<ApiResponse<{ todo: Todo }>>(`/tenants/${tenantId}/todos/${todoId}`, data),

  delete: (tenantId: string, todoId: string) =>
    api.delete<MessageResponse>(`/tenants/${tenantId}/todos/${todoId}`),
};
