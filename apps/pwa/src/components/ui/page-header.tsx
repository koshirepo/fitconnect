/**
 * Documentation: The top of every screen.
 *
 * - One shape for what was ten: the app had `<h1>` written eleven different ways — `text-2xl` here, `text-xl sm:text-2xl` there, some with an icon, some truncating, descriptions in two different sizes — and seven different flex containers around them. None of that was a decision; it was what each screen happened to be written with.
 * - Title and description take the width and truncate; actions stay a fixed block on the right and wrap among themselves. That is what keeps a long gym name from pushing "New member" off a phone.
 * - The icon is optional and belongs to the screen, not the title text: it renders at the title's size and is hidden from screen readers, which already have the words.
 * - Pair it with `PAGE_STACK` for the spacing between a page's sections, so two screens built a year apart still line up.
 * - Primary exports: PageHeader, PAGE_STACK.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The rhythm between a page's sections.
 *
 * Tighter on a phone, where 24px between every block is a scroll of its own,
 * and roomier from `sm` up. Used as the page root's class so the gap between a
 * header and what follows is the same on every screen.
 */
export const PAGE_STACK = "space-y-5 sm:space-y-6";

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  /** The screen's own glyph, drawn at the title's size. Optional. */
  icon?: React.ElementType;
  title: React.ReactNode;
  /** One line about what this screen is for. Optional, and never more than a line or two. */
  description?: React.ReactNode;
  /** Buttons and links for this screen. They keep their width; the title gives way first. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          {Icon && <Icon aria-hidden className="size-5 shrink-0 sm:size-6" />}
          <span className="truncate">{title}</span>
        </h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
    </div>
  );
}
