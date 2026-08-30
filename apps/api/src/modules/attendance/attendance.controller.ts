/**
 * Documentation: Attendance controller.
 *
 * - Owns the HTTP boundary for member check-ins, staff attendance marking, summaries, and calendar views, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: attendanceController.
 */
import type { Context } from "hono";
import { attendanceService } from "./attendance.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { ok, okMessage, okPaginated, notFound, badRequest, failWith } from "../../lib/response";
import {
  markAttendanceSchema,
  markAllAttendanceSchema,
  qrAttendanceSchema,
} from "./attendance.schema";
import { can } from "../../lib/permissions";
import { Permission } from "@fitconnect/shared/types/permissions";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const attendanceController = {
  /** GET /:tenantId/attendance/qr/members - public QR member picker */
  async qrMembers(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await attendanceService.listQrMembers(tenantId, c.req.query("search"));
    if ("error" in result) return notFound(c, result.error!);

    c.header("Cache-Control", "private, max-age=30");
    return ok(c, result.data);
  },

  /** POST /:tenantId/attendance/qr - QR check-in with optional auth */
  async qrCheckIn(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const user = c.get("authUser");
    const parsed = await parseBody(c, qrAttendanceSchema);
    if (!parsed.ok) return parsed.response;

    const result = await attendanceService.markQrAttendance(tenantId, user.id, parsed.data);
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "CREATE",
      entity: "Attendance",
      entityId: result.data.attendance.id,
      actorId: user.id,
      tenantId: result.data.tenant.id,
      metadata: {
        qr: true,
        mode: result.data.mode,
        membershipId: result.data.attendance.membershipId,
        date: result.data.attendance.date,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /** POST /:tenantId/attendance — self check-in */
  async checkIn(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const user = c.get("authUser");
    const parsed = await parseBody(c, markAttendanceSchema);
    if (!parsed.ok) return parsed.response;

    const result = await attendanceService.markAttendance(
      tenantId,
      user.id,
      null,
      parsed.data,
      true,
    );
    if ("error" in result) return failWith(c, result);

    await auditLog({
      action: "CREATE",
      entity: "Attendance",
      entityId: result.data.attendance.id,
      actorId: user.id,
      tenantId,
      metadata: { self: true, date: result.data.attendance.date },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /** POST /:tenantId/attendance/mark — admin/coach marks for specific member */
  async markForMember(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const user = c.get("authUser");
    const parsed = await parseBody(c, markAttendanceSchema);
    if (!parsed.ok) return parsed.response;

    const access = c.get("tenantAccess");
    const actorMembershipId = access?.tenantId === tenantId ? null : null;

    const result = await attendanceService.markAttendance(
      tenantId,
      user.id,
      actorMembershipId,
      parsed.data,
      false,
    );
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "CREATE",
      entity: "Attendance",
      entityId: result.data.attendance.id,
      actorId: user.id,
      tenantId,
      metadata: { membershipId: parsed.data.membershipId, date: result.data.attendance.date },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /** POST /:tenantId/attendance/mark-all — admin/coach marks for multiple members */
  async markAll(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const user = c.get("authUser");
    const parsed = await parseBody(c, markAllAttendanceSchema);
    if (!parsed.ok) return parsed.response;

    const result = await attendanceService.markAll(tenantId, null, parsed.data);

    await auditLog({
      action: "CREATE",
      entity: "Attendance",
      actorId: user.id,
      tenantId,
      metadata: { count: result.data.marked, date: parsed.data.date },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /** DELETE /:tenantId/attendance/:membershipId/:date — admin removes record */
  async remove(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const date = c.req.param("date")!;

    const result = await attendanceService.removeAttendance(tenantId, membershipId, date);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "Attendance",
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { membershipId, date },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, result.data.message);
  },

  /** GET /:tenantId/attendance?date=YYYY-MM-DD — list by date */
  async listByDate(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);
    const now = new Date();
    const date =
      c.req.query("date") ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const { data, total } = await attendanceService.listByDate(tenantId, date, page, limit);
    return okPaginated(c, data, { page, limit, total });
  },

  /** GET /:tenantId/attendance/member/:membershipId — history for one member */
  async listByMember(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const { page, limit } = parsePagination(c);
    const user = c.get("authUser");
    // Staff read anyone's history; everyone else is narrowed to their own record.
    const canReadAll = can(c, Permission.ATTENDANCE_READ);

    const result = await attendanceService.listByMember(
      tenantId,
      membershipId,
      page,
      limit,
      user.id,
      canReadAll,
    );
    if ("error" in result) return failWith(c, result);
    const { data, total } = result;
    return okPaginated(c, data, { page, limit, total });
  },

  /** GET /:tenantId/attendance/summary/:membershipId */
  async summary(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const user = c.get("authUser");
    const canReadAll = can(c, Permission.ATTENDANCE_READ);

    const result = await attendanceService.summary(tenantId, membershipId, user.id, canReadAll);
    if ("error" in result) return failWith(c, result);
    return ok(c, result.data);
  },

  /** GET /:tenantId/attendance/calendar?month=YYYY-MM */
  async calendarMonth(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const now = new Date();
    const month =
      c.req.query("month") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const result = await attendanceService.calendarMonth(tenantId, month);
    c.header("Cache-Control", "private, max-age=60");
    return ok(c, result.data);
  },

  /** GET /:tenantId/attendance/member/:membershipId/calendar?month=YYYY-MM */
  async memberCalendar(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const now = new Date();
    const month =
      c.req.query("month") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const user = c.get("authUser");
    const canReadAll = can(c, Permission.ATTENDANCE_CALENDAR_READ);

    const result = await attendanceService.memberCalendar(
      tenantId,
      membershipId,
      month,
      user.id,
      canReadAll,
    );
    if ("error" in result) return failWith(c, result);
    c.header("Cache-Control", "private, max-age=60");
    return ok(c, result.data);
  },
};
