import { Hono } from "hono";
import { TenantRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantRoles } from "../../middleware/authorize";
import { attendanceController } from "./attendance.controller";
import type { AppBindings } from "../../types/app-context";

export const attendanceRoutes = new Hono<AppBindings>();

// Self check-in (any authenticated member)
attendanceRoutes.post(
  "/:tenantId/attendance",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  attendanceController.checkIn,
);

// Admin/coach marks attendance for a specific member
attendanceRoutes.post(
  "/:tenantId/attendance/mark",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  attendanceController.markForMember,
);

// Admin/coach marks attendance for multiple members at once
attendanceRoutes.post(
  "/:tenantId/attendance/mark-all",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  attendanceController.markAll,
);

// Remove attendance record (admin only)
attendanceRoutes.delete(
  "/:tenantId/attendance/:membershipId/:date",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN]),
  attendanceController.remove,
);

// List attendance by date (admin/coach see all, members see their own via /my)
attendanceRoutes.get(
  "/:tenantId/attendance",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  attendanceController.listByDate,
);

// Member's own attendance history
attendanceRoutes.get(
  "/:tenantId/attendance/member/:membershipId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  attendanceController.listByMember,
);

// Attendance summary for a member
attendanceRoutes.get(
  "/:tenantId/attendance/summary/:membershipId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  attendanceController.summary,
);

// Calendar view: daily counts for a month
attendanceRoutes.get(
  "/:tenantId/attendance/calendar",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  attendanceController.calendarMonth,
);

// Member calendar: attendance dates for a specific member in a month
attendanceRoutes.get(
  "/:tenantId/attendance/member/:membershipId/calendar",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH, TenantRole.MEMBER]),
  attendanceController.memberCalendar,
);
