export type DueDateState = "none" | "current" | "overdue";

export function getDueDateState(dueDate?: string | null): DueDateState {
  if (!dueDate) return "none";

  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return "none";

  return parsed <= new Date() ? "overdue" : "current";
}
