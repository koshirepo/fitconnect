import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Re-export shared pure utilities so pages can keep importing from "@/lib/utils"
export { formatCurrency, formatDate, formatDateTime, getInitials } from "@/shared";

// UI-specific utility (depends on Tailwind – stays in PWA)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
