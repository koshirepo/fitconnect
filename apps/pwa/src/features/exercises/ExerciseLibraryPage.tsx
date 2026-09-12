/**
 * Documentation: The exercise library, as a member browses it.
 *
 * - A wall of clips with a search box and a muscle-group rail, laid out like a video site rather than like the rest of the dashboard: the thing being chosen is the picture, so the picture is the card.
 * - The library is the platform's, not the gym's. Every gym sees the same rows, which is why nothing here is tenant-scoped and why a member can only read: adding and editing live on the app-level screen.
 * - A card plays its clip on hover and stops on leave, muted and looping. A still frame of a barbell tells you very little; two seconds of the movement tells you what the exercise is, which is the whole reason these are videos.
 * - Clips are fetched a page at a time and only as far as somebody scrolls. Six hundred videos is not a page of media anybody should load at once.
 * - Primary exports: ExerciseLibraryPage.
 */
import * as React from "react";
import { Dumbbell, Heart, Play, Search } from "lucide-react";

import { useExerciseMuscleGroups, useExercisesInfinite } from "@/api/queries/exercises";
import { flattenPages } from "@/api/queries/shared";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useDebounced } from "@/lib/use-debounced";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Exercise } from "@fitconnect/shared/types/models";

/** The "All" chip, which is every library's first filter. */
const ALL_MUSCLES = "";

export default function ExerciseLibraryPage() {
  const navigate = useAppNavigate();

  const [search, setSearch] = React.useState("");
  const [muscleGroup, setMuscleGroup] = React.useState<string>(ALL_MUSCLES);
  // Typing "shoulder press" should not be seven requests.
  const term = useDebounced(search, 300);

  const groupsQuery = useExerciseMuscleGroups();
  const listQuery = useExercisesInfinite({
    ...(term.trim() ? { search: term.trim() } : {}),
    ...(muscleGroup ? { muscleGroup } : {}),
  });

  const exercises = React.useMemo(
    () => flattenPages<Exercise>(listQuery.data?.pages),
    [listQuery.data],
  );

  const loadMoreRef = useInfiniteScroll({
    hasMore: Boolean(listQuery.hasNextPage),
    loading: listQuery.isPending || listQuery.isFetchingNextPage,
    onLoadMore: () => {
      if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
        void listQuery.fetchNextPage();
      }
    },
  });

  const groups = groupsQuery.data ?? [];
  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={Dumbbell}
        title="Exercises"
        description="Watch how a movement is done, then build it into a plan."
      />

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by exercise, muscle or equipment"
            aria-label="Search exercises"
            className="pl-9"
          />
        </div>

        {/* The rail scrolls sideways on a phone rather than stacking into a
            wall of chips above the grid. */}
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          <MuscleChip
            label="All"
            count={total}
            active={muscleGroup === ALL_MUSCLES}
            onClick={() => setMuscleGroup(ALL_MUSCLES)}
          />
          {groups.map((group) => (
            <MuscleChip
              key={group.name}
              label={group.name}
              count={group.count}
              active={muscleGroup === group.name}
              onClick={() => setMuscleGroup(group.name)}
            />
          ))}
        </div>
      </div>

      {listQuery.isPending ? (
        <CardsGridSkeleton count={8} className="grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4" />
      ) : exercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Nothing matches that"
          description="Try a different search, or clear the muscle filter."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {exercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                onOpen={() => navigate(`/exercises/${exercise.slug}`)}
              />
            ))}
          </div>

          <div ref={loadMoreRef} className="flex justify-center py-4">
            {listQuery.isFetchingNextPage && <Spinner />}
          </div>
        </>
      )}
    </div>
  );
}

function MuscleChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[11px]",
          active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * One exercise, as a card that shows the movement.
 *
 * The clip is loaded at metadata level only until somebody points at it, so a
 * page of twenty-four costs a few hundred kilobytes rather than twenty-four
 * videos. Touch devices get the first frame and open the page on tap, which is
 * what a tap means there anyway.
 */
function ExerciseCard({ exercise, onOpen }: { exercise: Exercise; onOpen: () => void }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const source = exercise.videos.female ?? exercise.videos.male;

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    void video.play().catch(() => {
      // Autoplay refused — the poster frame stays, which is fine.
    });
  };

  const stop = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={play}
      onMouseLeave={stop}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
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
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Dumbbell className="h-8 w-8 opacity-40" />
          </div>
        )}

        <span className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="h-8 w-8 text-white drop-shadow" />
        </span>

        <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur">
          {exercise.muscleGroup}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-primary">
          {exercise.name}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-1 text-xs text-muted-foreground">
          {exercise.equipment && <span className="truncate">{exercise.equipment}</span>}
          {exercise.likeCount > 0 && (
            <span className="ml-auto inline-flex items-center gap-1">
              <Heart className={cn("h-3 w-3", exercise.liked && "fill-current text-destructive")} />
              {exercise.likeCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
