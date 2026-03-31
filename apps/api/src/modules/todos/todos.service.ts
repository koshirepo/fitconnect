/**
 * Documentation: Todos service.
 *
 * - Implements tenant todo business rules, including visibility permissions for admins and coaches.
 * - Keep role checks and completion-state transitions here so controllers and repositories stay thin.
 * - Primary exports: todoService.
 */
import { TenantRole, TodoVisibility } from "../../shared/types/enums";
import { todoRepository } from "./todos.repository";
import type { CreateTodoInput, UpdateTodoInput } from "./todos.schema";

type ServiceError = { error: string; status: 403 | 404 };

function mapTodoActor(
  actor:
    | {
        id: string;
        memberId: number;
        role: string;
        user: {
          id: string;
          name: string;
          avatarUrl: string | null;
        };
      }
    | null
    | undefined,
) {
  if (!actor) {
    return null;
  }

  return {
    membershipId: actor.id,
    memberId: actor.memberId,
    role: actor.role,
    userId: actor.user.id,
    name: actor.user.name,
    avatarUrl: actor.user.avatarUrl,
  };
}

function mapTodo(
  todo: Awaited<ReturnType<typeof todoRepository.findById>> extends infer TResult
    ? NonNullable<TResult>
    : never,
) {
  return {
    ...todo,
    createdBy: mapTodoActor(todo.createdBy),
    updatedBy: mapTodoActor(todo.updatedBy),
    completedBy: mapTodoActor(todo.completedBy),
  };
}

function canCoachMutate(todoVisibility: string) {
  return todoVisibility === TodoVisibility.PUBLIC;
}

function assertCoachCreatePermission(input: CreateTodoInput): ServiceError | null {
  if (input.visibility !== TodoVisibility.PUBLIC) {
    return {
      error: "Coaches can only create public todos.",
      status: 403,
    };
  }

  return null;
}

function assertCoachUpdatePermission(
  existingVisibility: string,
  nextVisibility?: string,
): ServiceError | null {
  if (!canCoachMutate(existingVisibility)) {
    return {
      error: "Coaches can only update public todos.",
      status: 403,
    };
  }

  if (nextVisibility && nextVisibility !== TodoVisibility.PUBLIC) {
    return {
      error: "Coaches can only keep todos public.",
      status: 403,
    };
  }

  return null;
}

export const todoService = {
  async list(
    tenantId: string,
    role: TenantRole,
    page: number,
    limit: number,
    search?: string,
    status?: string,
  ) {
    const normalizedStatus =
      status === "OPEN" || status === "COMPLETED" || status === "ALL"
        ? status
        : "ALL";
    const { todos, total } = await todoRepository.list(
      tenantId,
      role,
      page,
      limit,
      search,
      normalizedStatus,
    );

    return {
      data: {
        todos: todos.map((todo) => mapTodo(todo)),
      },
      total,
    };
  },

  async create(
    tenantId: string,
    userId: string,
    role: TenantRole,
    input: CreateTodoInput,
  ) {
    const actorMembership = await todoRepository.findActorMembership(tenantId, userId);
    if (!actorMembership) {
      return { error: "Staff membership not found in this gym.", status: 404 as const };
    }

    if (role === TenantRole.COACH) {
      const permissionError = assertCoachCreatePermission(input);
      if (permissionError) {
        return permissionError;
      }
    }

    const todo = await todoRepository.create(tenantId, actorMembership.id, input);
    return {
      data: {
        todo: mapTodo(todo),
      },
    };
  },

  async update(
    tenantId: string,
    todoId: string,
    userId: string,
    role: TenantRole,
    input: UpdateTodoInput,
  ) {
    const [existing, actorMembership] = await Promise.all([
      todoRepository.findById(todoId, tenantId),
      todoRepository.findActorMembership(tenantId, userId),
    ]);

    if (!existing) {
      return { error: "Todo not found.", status: 404 as const };
    }

    if (!actorMembership) {
      return { error: "Staff membership not found in this gym.", status: 404 as const };
    }

    if (role === TenantRole.COACH) {
      const permissionError = assertCoachUpdatePermission(
        existing.visibility,
        input.visibility,
      );
      if (permissionError) {
        return permissionError;
      }
    }

    const updateData: UpdateTodoInput & {
      updatedById: string;
      completedAt?: Date | null;
      completedById?: string | null;
    } = {
      ...input,
      updatedById: actorMembership.id,
    };

    if (input.isCompleted === true && !existing.isCompleted) {
      updateData.completedAt = new Date();
      updateData.completedById = actorMembership.id;
    }

    if (input.isCompleted === false && existing.isCompleted) {
      updateData.completedAt = null;
      updateData.completedById = null;
    }

    const todo = await todoRepository.update(todoId, updateData);
    return {
      data: {
        todo: mapTodo(todo),
      },
    };
  },

  async delete(tenantId: string, todoId: string, role: TenantRole) {
    const existing = await todoRepository.findById(todoId, tenantId);
    if (!existing) {
      return { error: "Todo not found.", status: 404 as const };
    }

    if (role === TenantRole.COACH && !canCoachMutate(existing.visibility)) {
      return { error: "Coaches can only delete public todos.", status: 403 as const };
    }

    await todoRepository.delete(todoId);
    return { data: true };
  },
};
