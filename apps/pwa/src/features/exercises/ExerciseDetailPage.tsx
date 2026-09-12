/**
 * Documentation: One exercise, with its clip and what people said about it.
 *
 * - The player leads, because the video is the thing: how a movement is done is not a sentence anybody wants to read. Everything else — the muscle, the equipment, the thread — sits under it.
 * - Most exercises were filmed twice, with a man and with a woman. The clip that matches the viewer's own gender plays by default, and a toggle switches between them where both exist. Neither is more correct; it is the same lift.
 * - Likes and comments go through the shared reaction hooks under the subject type `EXERCISE`, exactly as a store product and a gym's page do. One thread per exercise, shared by every gym, because the library is.
 * - A member may delete their own comment; whoever manages the library may delete any. A gym's own admin is deliberately not given that: the thread is not their gym's.
 * - Primary exports: ExerciseDetailPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Dumbbell, Heart } from "lucide-react";

import { useExercise } from "@/api/queries/exercises";
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useToggleLike,
} from "@/api/queries/reactions";
import { getApiError } from "@/api/client";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownView } from "@/components/ui/markdown-view";
import { useToast } from "@/components/ui/toast";
import { LikeButton } from "@/components/social/LikeButton";
import { CommentThread } from "@/components/social/CommentThread";
import { cn } from "@/lib/utils";
import type { SocialComment } from "@fitconnect/shared/types/models";

type Clip = "female" | "male";

export default function ExerciseDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useAppNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canModerate = can(Permission.PLATFORM_EXERCISES_MANAGE);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const viewerGender = useAuthStore((state) => state.user?.gender);
  // The page is public. A visitor watches the clip and reads the thread; liking
  // and writing need an account, so those controls are replaced rather than
  // shown broken.
  const signedIn = useAuthStore((state) => state.isAuthenticated);

  const exerciseQuery = useExercise(slug);
  const exercise = exerciseQuery.data;

  const commentsQuery = useComments("EXERCISE", exercise?.id, { enabled: signedIn });
  const toggleLike = useToggleLike("EXERCISE", exercise?.id);
  const addComment = useAddComment("EXERCISE", exercise?.id);
  const deleteComment = useDeleteComment("EXERCISE", exercise?.id);

  /**
   * Which clip plays, before anybody chooses.
   *
   * The viewer's own gender where the library has that clip, and whatever was
   * filmed otherwise — an exercise with one video shows that one rather than an
   * empty player.
   */
  const [clip, setClip] = React.useState<Clip | null>(null);
  const preferred: Clip = viewerGender === "MALE" ? "male" : "female";
  const shown: Clip =
    clip ??
    (exercise?.videos[preferred]
      ? preferred
      : exercise?.videos.female
        ? "female"
        : "male");

  const feed = commentsQuery.data;

  const handleLike = async (liked: boolean) => {
    try {
      await toggleLike.mutateAsync(liked);
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const handleComment = async (body: string) => {
    try {
      await addComment.mutateAsync(body);
      toast.success("Comment posted.");
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const handleDelete = async (comment: SocialComment) => {
    try {
      await deleteComment.mutateAsync(comment.id);
      toast.success("Comment deleted.");
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  if (exerciseQuery.isPending) return <DetailPageSkeleton />;

  if (!exercise) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="Exercise not found"
        description="It may have been retired from the library."
        action={
          <Button variant="outline" onClick={() => navigate("/exercises")}>
            <ArrowLeft className="h-4 w-4" />
            Back to exercises
          </Button>
        }
      />
    );
  }

  const source = exercise.videos[shown] ?? exercise.videos.female ?? exercise.videos.male;
  const hasBoth = Boolean(exercise.videos.male && exercise.videos.female);

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/exercises")}>
        <ArrowLeft className="h-4 w-4" />
        Exercises
      </Button>

      <div className="overflow-hidden rounded-xl border border-border bg-black">
        {source ? (
          <video
            key={source}
            src={source}
            controls
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="aspect-square w-full object-contain sm:aspect-video"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-muted-foreground">
            No video for this exercise yet.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{exercise.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{exercise.muscleGroup}</Badge>
            {exercise.equipment && <Badge variant="outline">{exercise.equipment}</Badge>}
            {exercise.secondaryMuscles.map((muscle) => (
              <Badge key={muscle} variant="outline">
                {muscle}
              </Badge>
            ))}
          </div>
        </div>

        {signedIn ? (
          <LikeButton
            liked={feed?.liked ?? exercise.liked ?? false}
            count={feed?.likeCount ?? exercise.likeCount}
            onToggle={handleLike}
            disabled={commentsQuery.isPending}
            label="exercise"
          />
        ) : (
          // The count without the button: a visitor sees that forty people
          // liked this, and what an account would let them add.
          <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
            <Heart className="h-4 w-4" />
            {exercise.likeCount}
          </span>
        )}
      </div>

      {/* Only where both were filmed. One clip is not a choice. */}
      {hasBoth && (
        <div className="flex gap-2">
          {(["female", "male"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setClip(option)}
              aria-pressed={shown === option}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                shown === option
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              {option === "female" ? "Female" : "Male"}
            </button>
          ))}
        </div>
      )}

      {exercise.description && (
        <p className="text-sm text-muted-foreground">{exercise.description}</p>
      )}

      {/* The long form, where somebody has written one. Absent for most of the
          library, which was imported from clips and has no prose yet — an
          empty card would be worse than no card. */}
      {exercise.markdown?.trim() && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>How to do it</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownView className="prose-sm">{exercise.markdown}</MarkdownView>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Comments{feed ? ` (${feed.comments.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread
            comments={feed?.comments ?? []}
            loading={signedIn && commentsQuery.isPending}
            canComment={signedIn}
            canDelete={(comment) => canModerate || comment.author.id === currentUserId}
            onSubmit={handleComment}
            onDelete={handleDelete}
            submitting={addComment.isPending}
            emptyDescription="Say how this one worked for you, or what to watch out for."
            signedOutHint={
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Sign in to like this exercise and join the conversation.
              </p>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
