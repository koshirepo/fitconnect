/**
 * Documentation: Create or edit one workout plan.
 *
 * - A page rather than a dialog: a plan is a title plus an open-ended list of exercises, which was already a scrolling box inside a scrolling page before it grew.
 * - A `planId` in the route means edit and seeds the form from the plan; without one it is a create.
 * - Assigning a plan to a member stays on the list page — that is a decision about a member, not an edit to the plan.
 * - Primary exports: WorkoutFormPage.
 */
import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Navigate, useParams } from "react-router-dom";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useCreateWorkoutPlan, useUpdateWorkoutPlan, useWorkoutPlan } from "@/api/queries/catalog";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { ExercisePickerDialog } from "@/features/exercises/ExercisePickerDialog";
import { useExercisesByIds } from "@/api/queries/exercises";
import { AlertCircle, ArrowLeft, Dumbbell, Plus, X } from "lucide-react";
import type { Exercise } from "@fitconnect/shared/types/models";
import type { PlanExercise } from "@/types/api";

type PlanExerciseKey = keyof PlanExercise;
type WorkoutPlan = NonNullable<ReturnType<typeof useWorkoutPlan>["data"]>;

export default function WorkoutFormPage() {
  const navigate = useAppNavigate();
  const { planId } = useParams<{ planId?: string }>();
  const isEdit = Boolean(planId);
  const { can } = usePermissions();
  /**
   * Who may open this form.
   *
   * A member writing their own plan holds `workouts:create:self` and neither of
   * the gym-wide grants, which the API accepts on all three writes — so gating
   * this page on `workouts:create` alone bounced them off a page the server
   * would have let them use.
   */
  const allowed = isEdit
    ? can(Permission.WORKOUTS_UPDATE) || can(Permission.WORKOUTS_CREATE_SELF)
    : can(Permission.WORKOUTS_CREATE) || can(Permission.WORKOUTS_CREATE_SELF);

  const planQuery = useWorkoutPlan(allowed && isEdit ? planId : undefined);
  const plan = planQuery.data;

  if (!allowed) {
    return <Navigate to="/workouts" replace />;
  }

  if (isEdit && planQuery.isLoading) return <FormPageSkeleton fields={6} />;

  if (isEdit && planQuery.isError) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Plan not found</CardTitle>
            <CardDescription>{getApiError(planQuery.error)}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/workouts")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Workout Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <WorkoutForm key={plan?.id ?? "new"} planId={planId} plan={plan} isEdit={isEdit} />;
}

/**
 * The form itself, mounted only once its plan has loaded.
 *
 * The `key` replaces a seed-once effect: this used to start with empty fields
 * and copy the loaded plan into state from a `useEffect`, guarded by a `seeded`
 * flag so a background refetch could not discard edits in progress. Keying on
 * the plan's id gets the same protection from React — a different plan mounts a
 * fresh form, anything else leaves this one alone — without the extra render.
 */
function WorkoutForm({
  planId,
  plan,
  isEdit,
}: {
  planId?: string;
  plan?: WorkoutPlan;
  isEdit: boolean;
}) {
  const navigate = useAppNavigate();
  const { currentTenantId } = useAuthStore();

  const [title, setTitle] = React.useState(plan?.title ?? "");
  const [description, setDescription] = React.useState(plan?.description ?? "");
  const [exercises, setExercises] = React.useState<PlanExercise[]>(plan?.exercises ?? []);
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  // Picking from the library is the usual way a line gets here; typing a name
  // by hand stays for anything the library does not have.
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const createPlan = useCreateWorkoutPlan();
  const updatePlan = useUpdateWorkoutPlan();

  /**
   * The library entries behind the lines that came from it.
   *
   * A line keeps its own name, so the form reads correctly without this; what
   * the lookup adds is the clip, which is how somebody scanning a plan sees at
   * a glance that row four is the movement they meant. Lines typed by hand
   * carry no id and simply have no clip to show.
   */
  const libraryIds = React.useMemo(
    () => exercises.map((entry) => entry.exerciseId).filter((id): id is string => Boolean(id)),
    [exercises],
  );
  const library = useExercisesByIds(libraryIds).data;

  const addExercise = () => {
    setExercises((prev) => [...prev, { name: "", sets: 3, reps: 10 }]);
  };


  const updateExercise = <K extends PlanExerciseKey>(idx: number, field: K, value: PlanExercise[K]) => {
    setExercises((prev) =>
      prev.map((exercise, index) =>
        index === idx ? ({ ...exercise, [field]: value } as PlanExercise) : exercise,
      ),
    );
  };

  const removeExercise = (idx: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;

    setError("");
    setSubmitting(true);
    try {
      const payload = {
        title,
        description: description || undefined,
        exercises: exercises.length > 0 ? exercises : undefined,
      };

      if (isEdit && planId) {
        await updatePlan.mutateAsync({ planId, data: payload });
      } else {
        await createPlan.mutateAsync(payload);
      }

      navigate("/workouts");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
      <PageHeader
        title={isEdit ? `Edit ${plan?.title ?? "plan"}` : "New Workout Plan"}
        description={
          isEdit
            ? "Change this plan's details and exercises."
            : "Build a plan you can assign to members."
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Plan Details</CardTitle>
            <CardDescription>Name the plan and describe who it is for.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="plan-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="plan-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Push Day - Chest & Shoulders"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-description">Description</Label>
              <Textarea
                id="plan-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Workout description..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Exercises</CardTitle>
                <CardDescription>Sets, reps, and any coaching notes.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => setPickerOpen(true)}>
                  <Plus className="h-3 w-3" />
                  Add from library
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addExercise}>
                  <Plus className="h-3 w-3" />
                  Type one
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {exercises.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No exercises yet. Add them from the library, or type one in. A plan can also be
                saved empty and filled in later.
              </p>
            )}

            <ExercisePickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onAdd={(lines) => setExercises((prev) => [...prev, ...lines])}
            />
            {exercises.map((ex, idx) => (
              <div key={idx} className="flex items-end gap-3 rounded-md border p-3">
                <PlanExerciseClip
                  exercise={ex.exerciseId ? library?.get(ex.exerciseId) : undefined}
                />
                <div className="grid flex-1 grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={ex.name}
                    onChange={(e) => updateExercise(idx, "name", e.target.value)}
                    placeholder="Bench Press"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Sets</Label>
                  <Input
                    type="number"
                    value={ex.sets ?? ""}
                    onChange={(e) => updateExercise(idx, "sets", parseInt(e.target.value) || 0)}
                    min={1}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Reps</Label>
                  <Input
                    type="number"
                    value={ex.reps ?? ""}
                    onChange={(e) => updateExercise(idx, "reps", parseInt(e.target.value) || 0)}
                    min={1}
                  />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={ex.notes ?? ""}
                    onChange={(e) => updateExercise(idx, "notes", e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeExercise(idx)}
                    aria-label="Remove exercise"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/workouts")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? "Saving..." : isEdit ? "Update Plan" : "Create Plan"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * The clip beside one plan line, where that line came from the library.
 *
 * Declared at module scope rather than inside the form on purpose: a component
 * defined during render is a new component type on every render, so React would
 * unmount and remount every one of these — reloading each video — on each
 * keystroke in a sets or reps field.
 *
 * Plays on hover, like the cards in the library and the rows in the picker. A
 * line typed by hand has no library entry and shows the placeholder instead.
 */
function PlanExerciseClip({ exercise }: { exercise?: Exercise }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const source = exercise?.videos.female ?? exercise?.videos.male;

  if (!source) {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
        <Dumbbell className="h-5 w-5 opacity-40" />
      </span>
    );
  }

  return (
    <span
      className="h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted/40"
      onMouseEnter={() => void videoRef.current?.play().catch(() => {})}
      onMouseLeave={() => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.currentTime = 0;
      }}
    >
      <video
        ref={videoRef}
        src={source}
        muted
        loop
        playsInline
        preload="metadata"
        title={exercise?.name}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
