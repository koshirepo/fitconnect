/**
 * Documentation: Create or edit one workout plan.
 *
 * - A page rather than a dialog: a plan is a title plus an open-ended list of exercises, which was already a scrolling box inside a scrolling page before it grew.
 * - A `planId` in the route means edit and seeds the form from the plan; without one it is a create.
 * - Assigning a plan to a member stays on the list page — that is a decision about a member, not an edit to the plan.
 * - Primary exports: WorkoutFormPage.
 */
import * as React from "react";
import { Navigate, useParams } from "react-router-dom";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import {
  useCreateWorkoutPlan,
  useUpdateWorkoutPlan,
  useWorkoutPlan,
} from "@/api/queries/catalog";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { AlertCircle, ArrowLeft, Plus, X } from "lucide-react";
import type { Exercise } from "@/types/api";

type ExerciseField = keyof Exercise;

export default function WorkoutFormPage() {
  const navigate = useAppNavigate();
  const { planId } = useParams<{ planId?: string }>();
  const isEdit = Boolean(planId);
  const { currentTenantId } = useAuthStore();
  const { can } = usePermissions();
  const allowed = isEdit ? can(Permission.WORKOUTS_UPDATE) : can(Permission.WORKOUTS_CREATE);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [exercises, setExercises] = React.useState<Exercise[]>([]);
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const createPlan = useCreateWorkoutPlan();
  const updatePlan = useUpdateWorkoutPlan();

  const planQuery = useWorkoutPlan(allowed && isEdit ? planId : undefined);
  const plan = planQuery.data;

  // Seeded once: re-seeding on a refetch would discard edits in progress.
  const [seeded, setSeeded] = React.useState(false);
  React.useEffect(() => {
    if (!isEdit || seeded || !plan) return;
    setTitle(plan.title);
    setDescription(plan.description ?? "");
    setExercises(plan.exercises ?? []);
    setSeeded(true);
  }, [isEdit, seeded, plan]);

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

  const addExercise = () => {
    setExercises((prev) => [...prev, { name: "", sets: 3, reps: 10 }]);
  };

  const updateExercise = <K extends ExerciseField>(idx: number, field: K, value: Exercise[K]) => {
    setExercises((prev) =>
      prev.map((exercise, index) =>
        index === idx ? ({ ...exercise, [field]: value } as Exercise) : exercise,
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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? `Edit ${plan?.title ?? "plan"}` : "New Workout Plan"}
        </h1>
        <p className="text-muted-foreground">
          {isEdit
            ? "Change this plan's details and exercises."
            : "Build a plan you can assign to members."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Plan Details</CardTitle>
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
                <CardTitle className="text-lg">Exercises</CardTitle>
                <CardDescription>Sets, reps, and any coaching notes.</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addExercise}>
                <Plus className="h-3 w-3" />
                Add Exercise
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {exercises.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No exercises yet. A plan can be saved without them and filled in later.
              </p>
            )}
            {exercises.map((ex, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end rounded-md border p-3">
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
