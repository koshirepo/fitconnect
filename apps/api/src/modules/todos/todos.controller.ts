/**
 * Documentation: Todos controller.
 *
 * - Owns the HTTP boundary for tenant todo management, including request parsing, service invocation, response shaping, and audit logging.
 * - Controller code should stay thin: parse inputs, call the service layer, and translate outcomes into the shared API envelope.
 * - Primary exports: todoController.
 */
import type { Context } from "hono";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import {
  forbidden,
  notFound,
  ok,
  okMessage,
  okPaginated,
} from "../../lib/response";
import type { AppBindings } from "../../types/app-context";
import { createTodoSchema, updateTodoSchema } from "./todos.schema";
import { todoService } from "./todos.service";

type AppContext = Context<AppBindings>;

export const todoController = {
  async list(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const role = c.get("tenantAccess")?.role;
    const { page, limit } = parsePagination(c);

    if (!role) {
      return forbidden(c, "Missing tenant role context.");
    }

    const { data, total } = await todoService.list(
      tenantId,
      role,
      page,
      limit,
      c.req.query("search"),
      c.req.query("status"),
    );

    return okPaginated(c, data, { page, limit, total });
  },

  async create(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const role = c.get("tenantAccess")?.role;
    const parsed = await parseBody(c, createTodoSchema);
    if (!parsed.ok) return parsed.response;

    if (!role) {
      return forbidden(c, "Missing tenant role context.");
    }

    const result = await todoService.create(
      tenantId,
      c.get("authUser").id,
      role,
      parsed.data,
    );

    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error);
      return forbidden(c, result.error);
    }

    await auditLog({
      action: "CREATE",
      entity: "Todo",
      entityId: result.data.todo.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: {
        title: parsed.data.title,
        visibility: parsed.data.visibility,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async update(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const todoId = c.req.param("todoId")!;
    const role = c.get("tenantAccess")?.role;
    const parsed = await parseBody(c, updateTodoSchema);
    if (!parsed.ok) return parsed.response;

    if (!role) {
      return forbidden(c, "Missing tenant role context.");
    }

    const result = await todoService.update(
      tenantId,
      todoId,
      c.get("authUser").id,
      role,
      parsed.data,
    );

    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error);
      return forbidden(c, result.error);
    }

    await auditLog({
      action: "UPDATE",
      entity: "Todo",
      entityId: todoId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async delete(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const todoId = c.req.param("todoId")!;
    const role = c.get("tenantAccess")?.role;

    if (!role) {
      return forbidden(c, "Missing tenant role context.");
    }

    const result = await todoService.delete(tenantId, todoId, role);
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return forbidden(c, result.error!);
    }

    await auditLog({
      action: "DELETE",
      entity: "Todo",
      entityId: todoId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Todo deleted.");
  },
};
