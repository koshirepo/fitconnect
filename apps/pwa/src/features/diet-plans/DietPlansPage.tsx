/**
 * Documentation: A gym's diet plans.
 *
 * - Shaped like the workout plans list: staff see and manage the plans they may write, a member sees the plans assigned to them — including the ones they designed themselves.
 * - Each card states what the plan adds up to over a day, because "2,300 kcal, 160 g protein" is how a plan is compared with the next one.
 * - Editing and deleting are offered where the API would allow them: a plan the caller wrote, or any plan for somebody holding the gym-wide grant.
 * - The food library is one tap away from here, in place of a sidebar entry of its own.
 * - Primary exports: DietPlansPage.
 */
import * as React from "react";
import { Apple, Plus, Salad, Trash2, UserPlus } from "lucide-react";

import {
  useAssignDietPlan,
  useDeleteDietPlan,
  useDietPlansInfinite,
} from "@/api/queries/diet-plans";
import { useAllMembers } from "@/api/queries/members";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { usePermissions } from "@/features/auth/permission-gate";
import { MacroChips } from "@/features/food-items/food-ui";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { Permission } from "@fitconnect/shared/types/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import MemberSelector from "@/components/ui/memberSelector";
import type { TenantMember } from "@/types/api";
import type { DietPlan } from "@fitconnect/shared/types/models";

export default function DietPlansPage() {
  const navigate = useAppNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const userId = useAuthStore((state) => state.user?.id);

  const canCreateForGym = can(Permission.DIET_PLANS_CREATE);
  const canCreateOwn = can(Permission.DIET_PLANS_CREATE_SELF);
  const canCreate = canCreateForGym || canCreateOwn;
  const canAssign = can(Permission.DIET_PLANS_ASSIGN);
  const canUpdateAny = can(Permission.DIET_PLANS_UPDATE);
  const canDeleteAny = can(Permission.DIET_PLANS_DELETE);

  const plansQuery = useDietPlansInfinite();
  const plans = React.useMemo(
    () => flattenPages<DietPlan>(plansQuery.data?.pages),
    [plansQuery.data],
  );

  const deletePlan = useDeleteDietPlan();
  const assignPlan = useAssignDietPlan();

  const [assignPlanId, setAssignPlanId] = React.useState<string | null>(null);
  const [selectedMember, setSelectedMember] = React.useState<TenantMember | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<DietPlan | null>(null);

  const loadMoreRef = useInfiniteScroll({
    hasMore: Boolean(plansQuery.hasNextPage),
    loading: plansQuery.isPending || plansQuery.isFetchingNextPage,
    onLoadMore: () => {
      if (plansQuery.hasNextPage && !plansQuery.isFetchingNextPage) {
        void plansQuery.fetchNextPage();
      }
    },
  });

  const rosterQuery = useAllMembers({ enabled: assignPlanId !== null });
  const members = React.useMemo(
    () => (rosterQuery.data ?? []).filter((member) => member.status === "ACTIVE"),
    [rosterQuery.data],
  );

  const isOwn = (plan: DietPlan) => Boolean(userId && plan.creator?.id === userId);
  // A coach's list only ever holds plans they wrote, so the gym-wide grant
  // reaching further here matches what the API allows.
  const mayEdit = (plan: DietPlan) => isOwn(plan) || canUpdateAny;
  const mayDelete = (plan: DietPlan) => isOwn(plan) || canDeleteAny;

  const handleAssign = async () => {
    if (!assignPlanId || !selectedMember) return;
    try {
      await assignPlan.mutateAsync({ planId: assignPlanId, membershipId: selectedMember.id });
      toast.success(`Plan assigned to ${selectedMember.name}.`);
      setAssignPlanId(null);
      setSelectedMember(null);
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await deletePlan.mutateAsync(target.id);
      toast.success("Diet plan deleted.");
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={Salad}
        title="Diet Plans"
        description={canCreateForGym ? "Build eating plans and assign them to members." : "Your diet plans"}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/food-items")}>
              <Apple className="h-4 w-4" />
              Food Items
            </Button>
            {canCreate && (
              <Button onClick={() => navigate("/diet-plans/new")}>
                <Plus className="h-4 w-4" />
                {canCreateForGym ? "New Plan" : "Design my plan"}
              </Button>
            )}
          </>
        }
      />

      {plansQuery.isPending ? (
        <ListPageSkeleton search={false} filters={0} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Salad}
          title="No diet plans"
          description={
            canCreateForGym
              ? "Create your first diet plan from the food library."
              : canCreateOwn
                ? "No plans assigned to you yet. You can design your own."
                : "No plans assigned to you yet."
          }
          action={
            canCreate ? (
              <Button onClick={() => navigate("/diet-plans/new")}>
                <Plus className="h-4 w-4" />
                {canCreateForGym ? "Create Plan" : "Design my plan"}
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
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/diet-plans/${plan.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{plan.title}</CardTitle>
                      <CardDescription>
                        by {isOwn(plan) ? "you" : (plan.creator?.name ?? "Unknown")} ·{" "}
                        {formatDate(plan.createdAt)}
                      </CardDescription>
                    </div>
                    {plan._count && canAssign && (
                      <Badge variant="secondary" className="shrink-0">
                        {plan._count.assignments} assigned
                      </Badge>
                    )}
                  </div>
                  {(plan.goal || plan.dietType) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {plan.goal && <Badge variant="outline">{plan.goal}</Badge>}
                      {plan.dietType && <Badge variant="outline">{plan.dietType}</Badge>}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{plan.description}</p>
                  )}
                  {plan.totals && <MacroChips values={plan.totals} size="xs" />}
                  <p className="text-xs text-muted-foreground">
                    {plan.mealCount ?? 0} {plan.mealCount === 1 ? "meal" : "meals"}
                    {plan.targetCalories ? ` · target ${plan.targetCalories} kcal` : ""}
                  </p>

                  <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                    {mayEdit(plan) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/diet-plans/${plan.id}/edit`)}
                      >
                        Edit
                      </Button>
                    )}
                    {canAssign && (
                      <Button variant="outline" size="sm" onClick={() => setAssignPlanId(plan.id)}>
                        <UserPlus className="h-3 w-3" />
                        Assign
                      </Button>
                    )}
                    {mayDelete(plan) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(plan)}
                        aria-label={`Delete ${plan.title}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {(plansQuery.hasNextPage || plansQuery.isFetchingNextPage) && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {plansQuery.isFetchingNextPage && <Spinner />}
            </div>
          )}
        </>
      )}

      <Dialog open={assignPlanId !== null} onOpenChange={(open) => !open && setAssignPlanId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign plan to a member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Member</Label>
              <MemberSelector
                members={members}
                selectedMember={selectedMember}
                onSelect={setSelectedMember}
                placeholder="Choose a member..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignPlanId(null)}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={!selectedMember || assignPlan.isPending}>
                {assignPlan.isPending ? "Assigning…" : "Assign"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete diet plan?"
        description="The plan is removed from every member it was assigned to."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
