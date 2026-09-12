/**
 * Documentation: The exercise library, as the platform manages it.
 *
 * - The app-level screen behind `platform:exercises:manage`: add an exercise, correct a name or a muscle group, point it at different clips, retire one. A gym never reaches this — the library is one catalogue every gym trains from, so one gym renaming a lift would rename it for all of them.
 * - Videos are named by their object key rather than uploaded here. The clips are already in the bucket, filed by muscle group, and the bulk of the library was imported from exactly those keys; this screen is for the corrections and the occasional addition.
 * - Retired rows are listed, faded, because being able to see what was taken out is the point of retiring rather than deleting. The API decides which of the two a delete becomes: an exercise somebody has commented on is retired so the thread survives.
 * - Primary exports: PlatformExercisesPage.
 */
import * as React from "react";
import { Dumbbell, Pencil, Plus, Search, Trash2 } from "lucide-react";

import {
  useCreateExercise,
  useDeleteExercise,
  useExerciseMuscleGroups,
  useExercisesInfinite,
  useUpdateExercise,
} from "@/api/queries/exercises";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { useDebounced } from "@/lib/use-debounced";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { Label } from "@/components/ui/label";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Exercise } from "@fitconnect/shared/types/models";

/** A blank row, and what a new one starts as. */
const EMPTY_DRAFT = {
  name: "",
  muscleGroup: "",
  equipment: "",
  description: "",
  markdown: "",
  maleVideoKey: "",
  femaleVideoKey: "",
  isActive: true,
};

type Draft = typeof EMPTY_DRAFT;

export default function PlatformExercisesPage() {
  const toast = useToast();

  const [search, setSearch] = React.useState("");
  const term = useDebounced(search, 300);

  // The manage screen wants the retired rows too.
  const listQuery = useExercisesInfinite({
    ...(term.trim() ? { search: term.trim() } : {}),
    includeInactive: true,
  });
  const groupsQuery = useExerciseMuscleGroups(true);

  const exercises = React.useMemo(
    () => flattenPages<Exercise>(listQuery.data?.pages),
    [listQuery.data],
  );

  const createExercise = useCreateExercise();
  const updateExercise = useUpdateExercise();
  const deleteExercise = useDeleteExercise();

  const [editing, setEditing] = React.useState<Exercise | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<Exercise | null>(null);

  const loadMoreRef = useInfiniteScroll({
    hasMore: Boolean(listQuery.hasNextPage),
    loading: listQuery.isPending || listQuery.isFetchingNextPage,
    onLoadMore: () => {
      if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
        void listQuery.fetchNextPage();
      }
    },
  });

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (exercise: Exercise) => {
    setEditing(exercise);
    setDraft({
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment ?? "",
      description: exercise.description ?? "",
      markdown: exercise.markdown ?? "",
      // The stored key, not the playable URL: what is edited here is where the
      // clip lives in the bucket.
      maleVideoKey: "",
      femaleVideoKey: "",
      isActive: exercise.isActive,
    });
    setFormError("");
    setFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    // Blank means "leave it alone" on an edit and "no clip" on a create, which
    // is why an empty key is omitted rather than sent as null.
    const payload = {
      name: draft.name.trim(),
      muscleGroup: draft.muscleGroup.trim(),
      equipment: draft.equipment.trim() || null,
      description: draft.description.trim() || null,
      markdown: draft.markdown.trim() || null,
      isActive: draft.isActive,
      ...(draft.maleVideoKey.trim() ? { maleVideoKey: draft.maleVideoKey.trim() } : {}),
      ...(draft.femaleVideoKey.trim() ? { femaleVideoKey: draft.femaleVideoKey.trim() } : {}),
    };

    try {
      if (editing) {
        await updateExercise.mutateAsync({ exerciseId: editing.id, data: payload });
        toast.success(`${payload.name} updated.`);
      } else {
        await createExercise.mutateAsync(payload);
        toast.success(`${payload.name} added to the library.`);
      }
      setFormOpen(false);
    } catch (caught) {
      setFormError(getApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);

    try {
      const result = await deleteExercise.mutateAsync(target.id);
      toast.success(
        result.retained
          ? `${target.name} has comments, so it was retired rather than deleted.`
          : `${target.name} deleted.`,
      );
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const groups = groupsQuery.data ?? [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={Dumbbell}
        title="Exercise library"
        description="One catalogue of clips, shared by every gym."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New exercise
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by exercise, muscle or equipment"
          aria-label="Search the library"
          className="pl-9"
        />
      </div>

      {listQuery.isPending ? (
        <ListPageSkeleton rows={6} search={false} filters={0} />
      ) : exercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title={term ? "Nothing matches that" : "The library is empty"}
          description={
            term
              ? "Try a different search."
              : "Import the clips from the bucket, or add one by hand."
          }
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New exercise
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {exercises.map((exercise) => (
              <Card key={exercise.id} className={cn(!exercise.isActive && "opacity-70")}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {exercise.name}
                      <Badge variant="secondary" className="text-xs">
                        {exercise.muscleGroup}
                      </Badge>
                      {exercise.equipment && (
                        <Badge variant="outline" className="text-xs">
                          {exercise.equipment}
                        </Badge>
                      )}
                      {!exercise.isActive && (
                        <Badge variant="warning" className="text-xs">
                          Retired
                        </Badge>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        exercise.videos.female ? "female clip" : null,
                        exercise.videos.male ? "male clip" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "no clips"}
                      {exercise.commentCount > 0 && ` · ${exercise.commentCount} comments`}
                      {exercise.likeCount > 0 && ` · ${exercise.likeCount} likes`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(exercise)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPendingDelete(exercise)}
                      aria-label={`Delete ${exercise.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div ref={loadMoreRef} className="flex justify-center py-4">
            {listQuery.isFetchingNextPage && <Spinner />}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New exercise"}</DialogTitle>
            <DialogDescription>
              Clips are named by their key in the bucket, for example
              exercise/girl/Abs/Sit-ups.mp4
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="exercise-name">Name *</Label>
                <Input
                  id="exercise-name"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Barbell Curl"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exercise-muscle">Muscle group *</Label>
                <Input
                  id="exercise-muscle"
                  list="exercise-muscle-groups"
                  value={draft.muscleGroup}
                  onChange={(event) => setDraft({ ...draft, muscleGroup: event.target.value })}
                  placeholder="Biceps"
                  required
                />
                <datalist id="exercise-muscle-groups">
                  {groups.map((group) => (
                    <option key={group.name} value={group.name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exercise-equipment">Equipment</Label>
              <Input
                id="exercise-equipment"
                value={draft.equipment}
                onChange={(event) => setDraft({ ...draft, equipment: event.target.value })}
                placeholder="Barbell"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exercise-female-key">Female clip key</Label>
              <Input
                id="exercise-female-key"
                value={draft.femaleVideoKey}
                onChange={(event) => setDraft({ ...draft, femaleVideoKey: event.target.value })}
                placeholder={editing ? "Leave blank to keep the current clip" : "exercise/girl/…"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exercise-male-key">Male clip key</Label>
              <Input
                id="exercise-male-key"
                value={draft.maleVideoKey}
                onChange={(event) => setDraft({ ...draft, maleVideoKey: event.target.value })}
                placeholder={editing ? "Leave blank to keep the current clip" : "exercise/men/…"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exercise-description">Description</Label>
              <Textarea
                id="exercise-description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                rows={2}
                placeholder="One line, shown under the name on a card."
              />
            </div>

            {/* The page behind the card: form cues, common mistakes, what it
                works. Written and previewed the same way a gym writes its own
                profile. */}
            <MarkdownEditor
              id="exercise-markdown"
              label="Full description"
              value={draft.markdown}
              onChange={(value) => setDraft({ ...draft, markdown: value })}
              rows={8}
              minHeight={160}
              placeholder={"## How to do it\n\n1. Set up…\n\n**Watch out for:** …"}
              hint="Shown on the exercise's own page, under the video."
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
              />
              Offered in every gym's library
            </label>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !draft.name.trim()}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add exercise"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? "this exercise"}?`}
        description="If anybody has commented on it, it is retired instead so the thread survives."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
