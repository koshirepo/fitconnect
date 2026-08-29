/**
 * Documentation: A comment thread.
 *
 * - Renders what people wrote and, for whoever may write, a box to add to it. Used unchanged for a store product and for a gym's own page, because a reader sees no difference between the two.
 * - Presentational: the list, the composer, and the delete control are handed in as data and callbacks. Where the comments came from and what invalidates them stays in the hooks above, so this file has no opinion about either surface.
 * - A delete is offered when `canDelete` says so, which is the caller's business: the author of a comment, or a gym moderating its own page.
 * - Newest first, matching the API. Somebody opening a busy product wants what was said today, not the first thing said last year.
 * - Primary exports: CommentThread.
 */
import * as React from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRow } from "@/components/ui/skeleton";
import { formatDateTime, getInitials } from "@/lib/utils";
import type { SocialComment } from "@fitconnect/shared/types/models";

/** Kept short of the API's 2000 so the counter warns before the server refuses. */
const MAX_LENGTH = 2000;

export function CommentThread({
  comments,
  loading = false,
  canComment,
  canDelete,
  onSubmit,
  onDelete,
  submitting = false,
  emptyDescription = "Be the first to say something.",
  signedOutHint,
}: {
  comments: SocialComment[];
  loading?: boolean;
  canComment: boolean;
  /** Decided per comment: its author, or somebody moderating. */
  canDelete: (comment: SocialComment) => boolean;
  onSubmit: (body: string) => Promise<void>;
  onDelete: (comment: SocialComment) => void;
  submitting?: boolean;
  emptyDescription?: string;
  /** Shown in place of the box when there is nobody signed in to write as. */
  signedOutHint?: React.ReactNode;
}) {
  const [draft, setDraft] = React.useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || submitting) return;

    await onSubmit(body);
    // Cleared only once the write resolved: a failed post that wiped the box
    // would lose what somebody typed.
    setDraft("");
  };

  return (
    <div className="space-y-4">
      {canComment ? (
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="Write a comment..."
            rows={3}
            aria-label="Write a comment"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {draft.length}/{MAX_LENGTH}
            </span>
            <Button type="submit" size="sm" disabled={!draft.trim() || submitting}>
              {submitting ? "Posting..." : "Post comment"}
            </Button>
          </div>
        </form>
      ) : (
        signedOutHint
      )}

      {loading ? (
        // An avatar and two lines, which is the shape of a comment row below.
        <div className="space-y-3">
          {[0, 1, 2].map((row) => (
            <SkeletonRow key={row} className="rounded-lg border p-3" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No comments yet" description={emptyDescription} />
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3 rounded-lg border p-3">
              <Avatar className="h-9 w-9 shrink-0">
                {comment.author.avatarUrl && (
                  <AvatarImage src={comment.author.avatarUrl} alt="" />
                )}
                <AvatarFallback>{getInitials(comment.author.name)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium">{comment.author.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(comment.createdAt)}
                  </p>
                </div>
                {/* Wrapped rather than truncated: a comment is the content here,
                    not a label, so an overflowing word breaks instead of hiding. */}
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
              </div>

              {canDelete(comment) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => onDelete(comment)}
                  aria-label={`Delete comment by ${comment.author.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
