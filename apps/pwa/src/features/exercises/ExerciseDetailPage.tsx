/**
 * Documentation: One exercise, with its clip and what people said about it.
 *
 * - The player leads, because the video is the thing: how a movement is done is not a sentence anybody wants to read. Everything else — the muscle, the equipment, the thread — sits under it.
 * - Laid out like a video site rather than a form: the clip and its conversation take the main column, and what to watch next runs down the side where there is room for it. Below `lg` that rail falls underneath, which is the same order a phone would want anyway.
 * - Most exercises were filmed twice, with a man and with a woman. The clip that matches the viewer's own gender plays by default, and a toggle switches between them where both exist. Neither is more correct; it is the same lift.
 * - Likes and comments go through the shared reaction hooks under the subject type `EXERCISE`, exactly as a store product and a gym's page do. One thread per exercise, shared by every gym, because the library is.
 * - A member may delete their own comment; whoever manages the library may delete any. A gym's own admin is deliberately not given that: the thread is not their gym's.
 * - Primary exports: ExerciseDetailPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Dumbbell, Heart, MessageSquare } from "lucide-react";

import { useExercise, useExercisesInfinite } from "@/api/queries/exercises";
import { flattenPages } from "@/api/queries/shared";
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
import type { Exercise, SocialComment } from "@fitconnect/shared/types/models";

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
   * What else trains the same muscle.
   *
   * The reason somebody is on this page is rarely this one lift — it is that
   * they are building a session and want the movement that fits. Fetched by
   * muscle group, which is the only grouping the library actually has.
   */
  const relatedQuery = useExercisesInfinite(
    exercise?.muscleGroup ? { muscleGroup: exercise.muscleGroup } : {},
    { enabled: Boolean(exercise?.muscleGroup), limit: 12 },
  );

  const related = React.useMemo(
    () =>
      flattenPages<Exercise>(relatedQuery.data?.pages)
        .filter((entry) => entry.id !== exercise?.id)
        .slice(0, 8),
    [relatedQuery.data, exercise?.id],
  );

  /**
   * Which clip plays, before anybody chooses.
   *
   * The choice is remembered against the exercise it was made on, so opening
   * the next exercise starts from the viewer's own default again rather than
   * inheriting a toggle from the previous page — which is what a plain piece
   * of state would do, this component staying mounted between them.
   */
  const [choice, setChoice] = React.useState<{ slug: string; clip: Clip } | null>(null);
  const chosen = choice && choice.slug === slug ? choice.clip : null;

  const preferred: Clip = viewerGender === "MALE" ? "male" : "female";
  const shown: Clip =
    chosen ??
    (exercise?.videos[preferred] ? preferred : exercise?.videos.female ? "female" : "male");

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
  const likeCount = feed?.likeCount ?? exercise.likeCount;
  const commentCount = feed?.comments.length ?? exercise.commentCount;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/exercises")}>
        <ArrowLeft className="h-4 w-4" />
        Exercises
      </Button>

      {/* The clip and its conversation take the column that matters; what to
          watch next runs alongside, and falls underneath on a narrow screen. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-5">
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

          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold sm:text-2xl">{exercise.name}</h1>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{exercise.muscleGroup}</Badge>
                  {exercise.equipment && <Badge variant="outline">{exercise.equipment}</Badge>}
                  {exercise.secondaryMuscles.map((muscle) => (
                    <Badge key={muscle} variant="outline">
                      {muscle}
                    </Badge>
                  ))}
                </div>

                <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" />
                    {likeCount} {likeCount === 1 ? "like" : "likes"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {commentCount} {commentCount === 1 ? "comment" : "comments"}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {/* Only where both were filmed. One clip is not a choice. */}
                {hasBoth && (
                  <div className="inline-flex overflow-hidden rounded-full border border-border">
                    {(["female", "male"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setChoice({ slug: slug!, clip: option })}
                        aria-pressed={shown === option}
                        className={cn(
                          "px-3 py-1.5 text-sm font-medium transition-colors",
                          shown === option
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted",
                        )}
                      >
                        {option === "female" ? "Female" : "Male"}
                      </button>
                    ))}
                  </div>
                )}

                {signedIn ? (
                  <LikeButton
                    liked={feed?.liked ?? exercise.liked ?? false}
                    count={likeCount}
                    onToggle={handleLike}
                    disabled={commentsQuery.isPending}
                    label="exercise"
                  />
                ) : (
                  // The count without the button: a visitor sees that forty
                  // people liked this, and what an account would let them add.
                  <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
                    <Heart className="h-4 w-4" />
                    {likeCount}
                  </span>
                )}
              </div>
            </div>

            {exercise.description && (
              <p className="text-sm text-muted-foreground">{exercise.description}</p>
            )}
          </div>

          {/* The long form, where somebody has written one. Absent for most of
              the library, which was imported from clips and has no prose yet —
              an empty card would be worse than no card. */}
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

        {related.length > 0 && (
          <aside className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">More {exercise.muscleGroup} exercises</h2>
            <div className="space-y-2">
              {related.map((entry) => (
                <RelatedExercise
                  key={entry.id}
                  exercise={entry}
                  onOpen={() => navigate(`/exercises/${entry.slug}`)}
                />
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * One row of the side rail: the movement, and what it is called.
 *
 * The clip plays on hover here as it does on the library's cards — a still
 * frame of a barbell says very little, and picking the next exercise is the
 * whole reason the rail exists.
 */
function RelatedExercise({ exercise, onOpen }: { exercise: Exercise; onOpen: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const source = exercise.videos.female ?? exercise.videos.male;

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.currentTime = 0;
      }}
      className="flex w-full items-center gap-3 rounded-lg border border-border px-2 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted"
    >
      <span className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted/50">
        {source ? (
          <video
            ref={videoRef}
            src={source}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Dumbbell className="h-4 w-4 opacity-40" />
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm leading-snug font-medium">{exercise.name}</span>
        {exercise.equipment && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {exercise.equipment}
          </span>
        )}
      </span>
    </button>
  );
}
