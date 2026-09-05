/**
 * Documentation: The list of what people wrote.
 *
 * - One row shape for every feedback surface: who wrote it, when, and what they said. A review adds stars and a title above the body and a helpful button below it; a comment adds neither. Those are slots, not separate components.
 * - Takes a view model rather than an API type. A store comment calls the text `body` and the writer `author`; a shop review calls them `description` and `user`, and its nested comments call them `text` and `user` again. Three names for the same row is what kept these implementations apart, so the mapping happens once at each call site and the row below stays ignorant.
 * - Anonymous is a display state, not a missing author: a review posted anonymously has a real user id the server keeps and the page must not show.
 * - Newest first is the API's job, not this component's. It renders what it is handed.
 * - Primary exports: FeedbackList, FeedbackEntry, type FeedbackItem.
 */
import * as React from "react";
import { MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRow } from "@/components/ui/skeleton";
import { formatDateTime, getInitials } from "@/lib/utils";

/** What every feedback row needs, whatever the API called its fields. */
export type FeedbackItem = {
  id: string;
  authorName: string;
  avatarUrl?: string | null;
  createdAt: string;
  body: string;
};

export function FeedbackEntry({
  item,
  meta,
  actions,
  footer,
  className = "",
}: {
  item: FeedbackItem;
  /** Between the name row and the body — stars, a title, a verified badge. */
  meta?: React.ReactNode;
  /** Top-right of the row — delete, or anything else acting on this entry. */
  actions?: React.ReactNode;
  /** Below the body — helpful counts, replies, a nested thread. */
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={`flex gap-3 rounded-lg border p-3 ${className}`}>
      <Avatar className="h-9 w-9 shrink-0">
        {item.avatarUrl && <AvatarImage src={item.avatarUrl} alt="" />}
        <AvatarFallback>{getInitials(item.authorName)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-medium">{item.authorName}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
        </div>

        {meta}

        {/* Wrapped rather than truncated: this is the content, not a label, so
            an overflowing word breaks instead of hiding. */}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.body}</p>

        {footer}
      </div>

      {actions && <div className="shrink-0">{actions}</div>}
    </li>
  );
}

export function FeedbackList({
  items,
  loading = false,
  emptyTitle = "No comments yet",
  emptyDescription = "Be the first to say something.",
  renderEntry,
}: {
  items: FeedbackItem[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Lets a surface wrap each row with its own meta, actions and footer. */
  renderEntry?: (item: FeedbackItem) => React.ReactNode;
}) {
  if (loading) {
    // An avatar and two lines, which is the shape of a row above.
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <SkeletonRow key={row} className="rounded-lg border p-3" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState icon={MessageSquare} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) =>
        renderEntry ? (
          <React.Fragment key={item.id}>{renderEntry(item)}</React.Fragment>
        ) : (
          <FeedbackEntry key={item.id} item={item} />
        ),
      )}
    </ul>
  );
}
