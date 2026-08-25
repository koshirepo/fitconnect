/**
 * Documentation: Todos repository.
 *
 * - Encapsulates Prisma queries for tenant-scoped todos, including visibility-aware listing and actor relation loading.
 * - Keep raw query shape and persistence-specific details here so the service can focus on permission and workflow rules.
 * - Primary exports: todoRepository.
 */
import { prisma } from "../../lib/prisma";
import { TenantRole, TodoVisibility } from "@fitconnect/shared/types/enums";
import type { CreateTodoInput, UpdateTodoInput } from "./todos.schema";

const todoActorSelect = {
  id: true,
  memberId: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  },
} as const;

const todoSelect = {
  id: true,
  tenantId: true,
  title: true,
  description: true,
  visibility: true,
  isCompleted: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: todoActorSelect },
  updatedBy: { select: todoActorSelect },
  completedBy: { select: todoActorSelect },
} as const;

function getVisibleVisibilities(role: TenantRole) {
  if (role === TenantRole.ADMIN) {
    return undefined;
  }

  return [TodoVisibility.PUBLIC, TodoVisibility.PROTECTED] as const;
}

export const todoRepository = {
  findActorMembership(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, role: true },
    });
  },

  findById(todoId: string, tenantId: string) {
    return prisma.todo.findFirst({
      where: { id: todoId, tenantId },
      select: todoSelect,
    });
  },

  async list(
    tenantId: string,
    role: TenantRole,
    page: number,
    limit: number,
    search?: string,
    status?: "OPEN" | "COMPLETED" | "ALL",
  ) {
    const visibleVisibilities = getVisibleVisibilities(role);
    const trimmedSearch = search?.trim();

    const where = {
      tenantId,
      ...(visibleVisibilities
        ? {
            visibility: {
              in: [...visibleVisibilities],
            },
          }
        : {}),
      ...(status === "OPEN"
        ? { isCompleted: false }
        : status === "COMPLETED"
          ? { isCompleted: true }
          : {}),
      ...(trimmedSearch
        ? {
            OR: [
              { title: { contains: trimmedSearch } },
              { description: { contains: trimmedSearch } },
            ],
          }
        : {}),
    };

    const [todos, total] = await Promise.all([
      prisma.todo.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ isCompleted: "asc" }, { updatedAt: "desc" }],
        select: todoSelect,
      }),
      prisma.todo.count({ where }),
    ]);

    return { todos, total };
  },

  create(tenantId: string, actorMembershipId: string, input: CreateTodoInput) {
    return prisma.todo.create({
      data: {
        tenantId,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        createdById: actorMembershipId,
        updatedById: actorMembershipId,
      },
      select: todoSelect,
    });
  },

  update(
    todoId: string,
    data: UpdateTodoInput & {
      updatedById: string;
      completedAt?: Date | null;
      completedById?: string | null;
    },
  ) {
    return prisma.todo.update({
      where: { id: todoId },
      data,
      select: todoSelect,
    });
  },

  delete(todoId: string) {
    return prisma.todo.delete({ where: { id: todoId } });
  },
};
