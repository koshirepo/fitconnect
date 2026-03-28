import type { Shift } from "@/types/api";

const shiftTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
});

export function formatShiftTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours ?? 0, minutes ?? 0);
  return shiftTimeFormatter.format(date);
}

export function formatShiftWindow(startTime: string, endTime: string) {
  return `${formatShiftTime(startTime)} - ${formatShiftTime(endTime)}`;
}

export function formatShiftLabel(shift: Pick<Shift, "name" | "startTime" | "endTime">) {
  return `${shift.name} (${formatShiftWindow(shift.startTime, shift.endTime)})`;
}
