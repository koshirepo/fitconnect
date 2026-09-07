/**
 * Documentation: The previous/next month header every calendar screen wears.
 *
 * - Chevron, month label, chevron. The forward arrow is disabled once the label reaches the current month, because none of these screens can report on a month that has not happened.
 * - `children` render under the label, for the screens that hang a count or a total off the heading rather than repeating the month in a card of their own.
 * - Existed as five near-identical copies before this — expenses, salary, one person's payslip, attendance and reminders — which is why the disabled rule had already drifted between them.
 * - Primary exports: MonthNav.
 */
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMonthStr, formatMonthLabel, shiftMonth } from "@/lib/month";
import { cn } from "@/lib/utils";

type MonthNavProps = {
  /** The month on show, as `YYYY-MM`. */
  month: string;
  /** Called with the month the arrows land on. */
  onMonthChange: (month: string) => void;
  /** A line under the heading — a visit count, a month total. */
  children?: React.ReactNode;
  className?: string;
};

export function MonthNav({ month, onMonthChange, children, className }: MonthNavProps) {
  // `>=` rather than `===`: a URL carrying a future month would otherwise
  // enable the forward arrow and let somebody page further into a year the
  // gym has no data for.
  const isCurrentMonth = month >= getMonthStr(new Date());

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Previous month"
        onClick={() => onMonthChange(shiftMonth(month, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="text-center">
        <h2 className="text-base font-semibold leading-tight">{formatMonthLabel(month)}</h2>
        {children}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Next month"
        onClick={() => onMonthChange(shiftMonth(month, 1))}
        disabled={isCurrentMonth}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
