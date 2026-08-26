import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import {
  useAssignWorkoutPlan,
  useDeleteWorkoutPlan,
  useWorkoutPlansInfinite,
} from "@/api/queries/catalog";
import { useAllMembers } from "@/api/queries/members";
import { flattenPages } from "@/api/queries/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { Plus, Dumbbell, Trash2, UserPlus } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import MemberSelector from "@/components/ui/memberSelector";
import type { WorkoutPlan, TenantMember } from "@/types/api";

export default function WorkoutsPage() {
  const navigate = useAppNavigate();
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

  const deletePlan = useDeleteWorkoutPlan();
  const assignPlan = useAssignWorkoutPlan();

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
  const [assignPlanId, setAssignPlanId] = React.useState<string | null>(null);
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

  // The roster the picker chooses from, fetched only once a dialog is opened
  // and shared with every other screen reading the same query.
  const rosterQuery = useAllMembers({ enabled: assignDialogOpen });
  const members = React.useMemo(
    () => (rosterQuery.data ?? []).filter((member) => member.status === "ACTIVE"),
    [rosterQuery.data],
  );

  const openAssign = (planId: string) => {
    if (!currentTenantId) return;
    setAssignPlanId(planId);
    setSelectedMember(null);
    setSelectedMemberId("");
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
          <Button onClick={() => navigate("/workouts/new")}>
            <Plus className="h-4 w-4" />
            New Plan
          </Button>
        )}
      </div>

      {loading ? (
        <ListPageSkeleton />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No workout plans"
          description={
            canCreate ? "Create your first workout plan." : "No plans assigned to you yet."
          }
          action={
            canCreate ? (
              <Button onClick={() => navigate("/workouts/new")}>
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/workouts/${plan.id}/edit`)}
                        >
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
