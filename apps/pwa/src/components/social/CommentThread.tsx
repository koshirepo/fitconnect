/**
 * Documentation: A comment thread.
 *
 * - Renders what people wrote and, for whoever may write, a box to add to it. Used unchanged for a store product and for a gym's own page, because a reader sees no difference between the two.
 * - Now a thin arrangement of `FeedbackComposer` and `FeedbackList`, which the shop's reviews use as well. This file keeps only what is specific to a comment: the wording, and who may delete one.
 * - Presentational: the list, the composer, and the delete control are handed in as data and callbacks. Where the comments came from and what invalidates them stays in the hooks above, so this file has no opinion about either surface.
 * - A delete is offered when `canDelete` says so, which is the caller's business: the author of a comment, or a gym moderating its own page.
 * - Newest first, matching the API. Somebody opening a busy product wants what was said today, not the first thing said last year.
 * - Primary exports: CommentThread.
 */
import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackComposer } from "@/components/feedback/feedback-composer";
import { FeedbackEntry, FeedbackList } from "@/components/feedback/feedback-list";
import type { SocialComment } from "@fitconnect/shared/types/models";

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
  // Keyed by id so a row can find its comment again for the delete callback,
  // which needs the API object rather than the flattened row.
  const byId = React.useMemo(
    () => new Map(comments.map((comment) => [comment.id, comment])),
    [comments],
  );

  const items = React.useMemo(
    () =>
      comments.map((comment) => ({
        id: comment.id,
        authorName: comment.author.name,
        avatarUrl: comment.author.avatarUrl,
        createdAt: comment.createdAt,
        body: comment.body,
      })),
    [comments],
  );

  return (
    <div className="space-y-4">
      {canComment ? (
        <FeedbackComposer onSubmit={onSubmit} disabled={submitting} />
      ) : (
        signedOutHint
      )}

      <FeedbackList
        items={items}
        loading={loading}
        emptyDescription={emptyDescription}
        renderEntry={(item) => {
          const comment = byId.get(item.id);
          return (
            <FeedbackEntry
              item={item}
              actions={
                comment && canDelete(comment) ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onDelete(comment)}
                    aria-label={`Delete comment by ${item.authorName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : undefined
              }
            />
          );
        }}
      />
    </div>
  );
}
