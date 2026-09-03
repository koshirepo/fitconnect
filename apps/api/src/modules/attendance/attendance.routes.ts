/**
 * Documentation: Attendance routes.
 *
 * - Declares the Hono routes and middleware chain for member check-ins, staff attendance marking, summaries, and calendar views. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/attendance/qr/members, POST /:tenantId/attendance/qr, POST /:tenantId/attendance, POST /:tenantId/attendance/mark, POST /:tenantId/attendance/mark-all, DELETE /:tenantId/attendance/:membershipId/:date, GET /:tenantId/attendance, GET /:tenantId/attendance/member/:membershipId, GET /:tenantId/attendance/summary/:membershipId, GET /:tenantId/attendance/calendar, GET /:tenantId/attendance/member/:membershipId/calendar.
 * - Primary exports: attendanceRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyTenantPermission, requireTenantPermissions } from "../../middleware/authorize";
import { attendanceController } from "./attendance.controller";
import { deviceController } from "./devices.controller";
import type { AppBindings } from "../../types/app-context";

export const attendanceRoutes = new Hono<AppBindings>();

// QR check-in flow: authentication is mandatory.
attendanceRoutes.get(
  "/:tenantId/attendance/qr/members",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_QR_MANAGE),
  attendanceController.qrMembers,
);

attendanceRoutes.post(
  "/:tenantId/attendance/qr",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_CHECKIN_SELF),
  attendanceController.qrCheckIn,
);

// Self check-in (any authenticated member)
attendanceRoutes.post(
  "/:tenantId/attendance",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_CHECKIN_SELF),
  attendanceController.checkIn,
);

// Marking attendance on behalf of a member is a staff capability
/**
 * Checking somebody in from their scanned card.
 *
 * The same grant that marks attendance by hand, because that is what this is —
 * only the member is identified by a camera rather than by a name typed into a
 * picker.
 */
attendanceRoutes.post(
  "/:tenantId/attendance/scan",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_MARK),
  attendanceController.scan,
);

attendanceRoutes.post(
  "/:tenantId/attendance/mark",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_MARK),
  attendanceController.markForMember,
);

attendanceRoutes.post(
  "/:tenantId/attendance/mark-all",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_MARK),
  attendanceController.markAll,
);

attendanceRoutes.delete(
  "/:tenantId/attendance/:membershipId/:date",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_DELETE),
  attendanceController.remove,
);

// List attendance by date (staff view of the whole gym)
attendanceRoutes.get(
  "/:tenantId/attendance",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_READ),
  attendanceController.listByDate,
);

// Member history and summaries: staff may read anyone, members only themselves
// (the controller scopes the query to the caller when they lack ATTENDANCE_READ).
attendanceRoutes.get(
  "/:tenantId/attendance/member/:membershipId",
  authenticate,
  requireAnyTenantPermission(Permission.ATTENDANCE_READ, Permission.ATTENDANCE_READ_SELF),
  attendanceController.listByMember,
);

attendanceRoutes.get(
  "/:tenantId/attendance/summary/:membershipId",
  authenticate,
  requireAnyTenantPermission(Permission.ATTENDANCE_READ, Permission.ATTENDANCE_READ_SELF),
  attendanceController.summary,
);

// Calendar view: daily counts for a month
attendanceRoutes.get(
  "/:tenantId/attendance/calendar",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_CALENDAR_READ),
  attendanceController.calendarMonth,
);

attendanceRoutes.get(
  "/:tenantId/attendance/member/:membershipId/calendar",
  authenticate,
  requireAnyTenantPermission(
    Permission.ATTENDANCE_CALENDAR_READ,
    Permission.ATTENDANCE_READ_SELF,
  ),
  attendanceController.memberCalendar,
);


// ─── RFID attendance machines ────────────────────────────────────────────────
//
// Registering a device is what authorises it to write attendance for this gym —
// the punch endpoint trusts a serial precisely because somebody added it here —
// so it sits behind the same capability as managing the QR check-in codes
// rather than behind plain attendance marking.

attendanceRoutes.get(
  "/:tenantId/attendance/devices",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_QR_MANAGE),
  deviceController.listDevices,
);

attendanceRoutes.post(
  "/:tenantId/attendance/devices",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_QR_MANAGE),
  deviceController.createDevice,
);

attendanceRoutes.patch(
  "/:tenantId/attendance/devices/:deviceId",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_QR_MANAGE),
  deviceController.updateDevice,
);

attendanceRoutes.delete(
  "/:tenantId/attendance/devices/:deviceId",
  authenticate,
  requireTenantPermissions(Permission.ATTENDANCE_QR_MANAGE),
  deviceController.deleteDevice,
);

// Mapping a member to the PIN their card is enrolled under. Behind member
// editing rather than device management: it changes whose visits get recorded.
attendanceRoutes.put(
  "/:tenantId/attendance/cards/:membershipId",
  authenticate,
  requireTenantPermissions(Permission.MEMBERS_UPDATE),
  deviceController.assignCard,
);
