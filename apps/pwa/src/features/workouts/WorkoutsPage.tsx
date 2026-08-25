import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import {
  useAssignWorkoutPlan,
  useCreateWorkoutPlan,
  useDeleteWorkoutPlan,
  useUpdateWorkoutPlan,
  useWorkoutPlansInfinite,
} from "@/api/queries/catalog";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { Plus, Dumbbell, Trash2, UserPlus, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import MemberSelector from "@/components/ui/memberSelector";
import { loadAllTenantMembers } from "@/lib/tenant-members";
import type { WorkoutPlan, Exercise, TenantMember } from "@/types/api";

type ExerciseField = keyof Exercise;

export default function WorkoutsPage() {
  const navigate = useNavigate();
  const { currentTenantId } = useAuthStore();
  const { can } = usePermissions();
  const canCreate = can(Permission.WORKOUTS_CREATE);
  const canDeletePlan = can(Permission.WORKOUTS_DELETE);
  const canReadAllPlans = can(Permission.WORKOUTS_CREATE);


  const plansQuery = useWorkoutPlansInfinite();
  const plans = React.useMemo(
    () => flattenPages<WorkoutPlan>(plansQuery.data?.pages),
    [plansQuery.data],
  );
  const loading = plansQuery.isLoading;
  const loadingMore = plansQuery.isFetchingNextPage;
  const hasMore = Boolean(plansQuery.hasNextPage);

  const createPlan = useCreateWorkoutPlan();
  const updatePlan = useUpdateWorkoutPlan();
  const deletePlan = useDeleteWorkoutPlan();
  const assignPlan = useAssignWorkoutPlan();

  // Create/Update dialog
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingPlan, setEditingPlan] = React.useState<WorkoutPlan | null>(null);
  const [formTitle, setFormTitle] = React.useState("");
  const [formDesc, setFormDesc] = React.useState("");
  const [formExercises, setFormExercises] = React.useState<Exercise[]>([]);
  const [formError, setFormError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
  const [assignPlanId, setAssignPlanId] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [selectedMember, setSelectedMember] = React.useState<TenantMember | null>(null);
  const [selectedMemberId, setSelectedMemberId] = React.useState("");

  // Delete confirm
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (plansQuery.hasNextPage && !plansQuery.isFetchingNextPage) {
        void plansQuery.fetchNextPage();
      }
    },
  });

  const openCreate = () => {
    setEditingPlan(null);
    setFormTitle("");
    setFormDesc("");
    setFormExercises([]);
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (plan: WorkoutPlan) => {
    setEditingPlan(plan);
    setFormTitle(plan.title);
    setFormDesc(plan.description ?? "");
    setFormExercises(plan.exercises ?? []);
    setFormError("");
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;
    setFormError("");
    setSubmitting(true);
    try {
      const payload = {
        title: formTitle,
        description: formDesc || undefined,
        exercises: formExercises.length > 0 ? formExercises : undefined,
      };
      if (editingPlan) {
        await updatePlan.mutateAsync({ planId: editingPlan.id, data: payload });
      } else {
        await createPlan.mutateAsync(payload);
      }
      setDialogOpen(false);
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (planId: string) => {
    if (!currentTenantId) return;
    setPendingDeleteId(planId);
    setConfirmOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!pendingDeleteId) return;
    try {
      await deletePlan.mutateAsync(pendingDeleteId);
    } catch {
      //
    } finally {
      setPendingDeleteId(null);
    }
  };

  const openAssign = async (planId: string) => {
    if (!currentTenantId) return;
    setAssignPlanId(planId);
    setSelectedMember(null);
    setSelectedMemberId("");
    try {
      const allMembers = await loadAllTenantMembers(currentTenantId, {
        status: "ACTIVE",
      });
      setMembers(allMembers);
    } catch {
      //
    }
    setAssignDialogOpen(true);
  };

  const handleAssign = async () => {
    if (!assignPlanId || !selectedMemberId) return;
    try {
      await assignPlan.mutateAsync({ planId: assignPlanId, membershipId: selectedMemberId });
      setAssignDialogOpen(false);
      setSelectedMember(null);
      setSelectedMemberId("");
    } catch {
      //
    }
  };

  // Exercise helpers
  const addExercise = () => {
    setFormExercises([...formExercises, { name: "", sets: 3, reps: 10 }]);
  };

  const updateExercise = <K extends ExerciseField>(idx: number, field: K, value: Exercise[K]) => {
    setFormExercises((prev) =>
      prev.map((exercise, index) =>
        index === idx ? ({ ...exercise, [field]: value } as Exercise) : exercise,
      ),
    );
  };

  const removeExercise = (idx: number) => {
    setFormExercises(formExercises.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workout Plans</h1>
          <p className="text-muted-foreground">
            {canReadAllPlans ? "Manage workout plans" : "Your assigned plans"}
          </p>
        </div>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Plan
          </Button>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No workout plans"
          description={
            canCreate ? "Create your first workout plan." : "No plans assigned to you yet."
          }
          action={
            canCreate ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Create Plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/workouts/${plan.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{plan.title}</CardTitle>
                      <CardDescription>
                        by {plan.creator?.name ?? "Unknown"} · {formatDate(plan.createdAt)}
                      </CardDescription>
                    </div>
                    {plan._count && (
                      <Badge variant="secondary">{plan._count.assignments} assigned</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {plan.description && (
                    <p className="text-sm text-muted-foreground mb-3">{plan.description}</p>
                  )}
                  <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    {canCreate && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEdit(plan)}>
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openAssign(plan.id)}>
                          <UserPlus className="h-3 w-3" />
                          Assign
                        </Button>
                      </>
                    )}
                    {canDeletePlan && (
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(plan.id)}>
                        <Trash2 className="h-3 w-3 text-destructive-foreground" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {plans.length > 0 && (hasMore || loadingMore) && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center py-4 text-sm text-muted-foreground"
            >
              {loadingMore ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Loading more...
                </div>
              ) : (
                "Scroll to load more"
              )}
            </div>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? "Edit Workout Plan" : "Create Workout Plan"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Push Day - Chest & Shoulders"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Workout description..."
                rows={3}
              />
            </div>

            {/* Exercises */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Exercises</Label>
                <Button type="button" variant="outline" size="sm" onClick={addExercise}>
                  <Plus className="h-3 w-3" />
                  Add Exercise
                </Button>
              </div>
              {formExercises.map((ex, idx) => (
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
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {formError && <p className="text-sm text-destructive-foreground">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingPlan ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Plan to Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Member</Label>
              <MemberSelector
                members={members}
                selectedMember={selectedMember}
                onSelect={(member) => {
                  setSelectedMember(member);
                  setSelectedMemberId(member.id);
                }}
                placeholder="Choose a member..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={!selectedMemberId}>
                Assign
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete workout plan?"
        description="This plan will be permanently deleted."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
