/**
 * Documentation: Choosing exercises out of the library, while writing a plan.
 *
 * - A dialog over the plan form rather than a trip to the library and back: whoever is writing a plan has a half-typed form on screen, and losing it to go and look something up is how a plan ends up with "Row" typed from memory.
 * - Search and the muscle rail are the same two controls the library page offers, because they are what somebody uses to find a lift. The clip plays on hover here too — picking the right row is the whole job.
 * - Several at once. A plan is built in groups — three back movements, then two for biceps — so rows toggle and the dialog adds them together.
 * - What it hands back is plan lines, not library entries: the name is copied onto the line beside the id, so a plan written today still reads correctly if the library renames or retires the exercise later.
 * - Primary exports: ExercisePickerDialog.
 */
import * as React from "react";
import { Check, Dumbbell, Search } from "lucide-react";

import { useExerciseMuscleGroups, useExercisesInfinite } from "@/api/queries/exercises";
import { flattenPages } from "@/api/queries/shared";
import { useDebounced } from "@/lib/use-debounced";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Exercise, PlanExercise } from "@fitconnect/shared/types/models";

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives one plan line per chosen exercise, in the order they were picked. */
  onAdd: (lines: PlanExercise[]) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [muscleGroup, setMuscleGroup] = React.useState("");
  const [chosen, setChosen] = React.useState<Exercise[]>([]);
  const term = useDebounced(search, 300);

  const groupsQuery = useExerciseMuscleGroups();
  const listQuery = useExercisesInfinite(
    {
      ...(term.trim() ? { search: term.trim() } : {}),
      ...(muscleGroup ? { muscleGroup } : {}),
    },
    // Nothing is fetched until the dialog is actually open: this sits inside a
    // form most people open to change a title.
    { enabled: open, limit: 18 },
  );

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

  const toggle = (exercise: Exercise) => {
    setChosen((prev) =>
      prev.some((entry) => entry.id === exercise.id)
        ? prev.filter((entry) => entry.id !== exercise.id)
        : [...prev, exercise],
    );
  };

  const confirm = () => {
    onAdd(
      chosen.map((exercise) => ({
        exerciseId: exercise.id,
        // Copied, not referenced: a plan keeps the name it was written with.
        name: exercise.name,
        sets: 3,
        reps: 10,
      })),
    );
    setChosen([]);
    onOpenChange(false);
  };

  const groups = groupsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from the exercise library</DialogTitle>
          <DialogDescription>
            Pick as many as you need. Sets and reps are filled in afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by exercise, muscle or equipment"
              aria-label="Search the exercise library"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
            <MuscleChip label="All" active={!muscleGroup} onClick={() => setMuscleGroup("")} />
            {groups.map((group) => (
              <MuscleChip
                key={group.name}
                label={group.name}
                active={muscleGroup === group.name}
                onClick={() => setMuscleGroup(group.name)}
              />
            ))}
          </div>

          <div className="max-h-[45vh] min-h-[12rem] space-y-2 overflow-y-auto pr-1">
            {listQuery.isPending ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : exercises.length === 0 ? (
              <EmptyState
                icon={Dumbbell}
                title="Nothing matches that"
                description="Try a different search, or clear the muscle filter."
              />
            ) : (
              <>
                {exercises.map((exercise) => (
                  <PickerRow
                    key={exercise.id}
                    exercise={exercise}
                    picked={chosen.some((entry) => entry.id === exercise.id)}
                    onToggle={() => toggle(exercise)}
                  />
                ))}
                <div ref={loadMoreRef} className="flex justify-center py-2">
                  {listQuery.isFetchingNextPage && <Spinner />}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={chosen.length === 0}>
            <Check className="h-4 w-4" />
            Add {chosen.length > 0 ? chosen.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MuscleChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/** One row: the clip, what it is, and whether it is going in. */
function PickerRow({
  exercise,
  picked,
  onToggle,
}: {
  exercise: Exercise;
  picked: boolean;
  onToggle: () => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const source = exercise.videos.female ?? exercise.videos.male;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={picked}
      onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.currentTime = 0;
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
        picked ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
      )}
    >
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted/50">
        {source && (
          <video
            ref={videoRef}
            src={source}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{exercise.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[exercise.muscleGroup, exercise.equipment].filter(Boolean).join(" · ")}
        </span>
      </span>

      {picked && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
