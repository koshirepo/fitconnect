/**
 * Documentation: One diet plan, meal by meal.
 *
 * - Reads like a menu: each meal with its time, then every food with its photo, how much of it, and what that amount holds. The day's total leads the page and is compared against the target where the plan has one.
 * - Figures shown are always for the amount in the plan — a line of 1.5 servings shows 1.5 servings' worth — with the serving itself stated beside the name so nothing is ambiguous.
 * - A food from the library links to its page in the library, where the full nutrition label is.
 * - Staff who may assign see who has the plan and can add or remove members here. Edit and delete follow the same ownership rules as the list.
 * - Primary exports: DietPlanDetailPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Clock, Pencil, Salad, Trash2, UserPlus, Users, X } from "lucide-react";

import {
  useAssignDietPlan,
  useDeleteDietPlan,
  useDietPlan,
  useUnassignDietPlan,
} from "@/api/queries/diet-plans";
import { useAllMembers } from "@/api/queries/members";
import { getApiError } from "@/api/client";
import { usePermissions } from "@/features/auth/permission-gate";
import { FoodPhoto, MacroChips } from "@/features/food-items/food-ui";
import {
  MACROS,
  formatAmount,
  scaleNutrients,
  servingLabel,
  sumNutrients,
} from "@/features/food-items/nutrition";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { Permission } from "@fitconnect/shared/types/permissions";
import AvatarCard from "@/components/ui/avatarCard";
import MemberSelector from "@/components/ui/memberSelector";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import type { TenantMember } from "@/types/api";

export default function DietPlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useAppNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const userId = useAuthStore((state) => state.user?.id);

  const planQuery = useDietPlan(planId);
  const plan = planQuery.data;

  const deletePlan = useDeleteDietPlan();
  const assignPlan = useAssignDietPlan();
  const unassignPlan = useUnassignDietPlan();

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [selectedMember, setSelectedMember] = React.useState<TenantMember | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const rosterQuery = useAllMembers({ enabled: assignOpen });
  const members = React.useMemo(() => {
    const assigned = new Set((plan?.assignments ?? []).map((a) => a.membershipId));
    return (rosterQuery.data ?? []).filter(
      (member) => member.status === "ACTIVE" && !assigned.has(member.id),
    );
  }, [rosterQuery.data, plan?.assignments]);

  if (planQuery.isLoading) return <DetailPageSkeleton />;

  if (!plan) {
    return (
      <div className="space-y-5">
        <Button variant="outline" onClick={() => navigate("/diet-plans")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Diet Plans
        </Button>
        <EmptyState
          icon={Salad}
          title="Plan not found"
          description={
            planQuery.error ? getApiError(planQuery.error) : "The diet plan could not be loaded."
          }
        />
      </div>
    );
  }

  const isOwn = Boolean(userId && plan.creator?.id === userId);
  const mayEdit = isOwn || can(Permission.DIET_PLANS_UPDATE);
  const mayDelete = isOwn || can(Permission.DIET_PLANS_DELETE);
  const canAssign = can(Permission.DIET_PLANS_ASSIGN);

  const meals = plan.meals ?? [];
  const assignments = plan.assignments ?? [];
  const dayTotals = sumNutrients(meals.flatMap((meal) => meal.foods));
  const target = plan.targetCalories ?? 0;
  const progress = target > 0 ? Math.min(100, Math.round((dayTotals.calories / target) * 100)) : 0;

  const handleAssign = async () => {
    if (!planId || !selectedMember) return;
    try {
      await assignPlan.mutateAsync({ planId, membershipId: selectedMember.id });
      toast.success(`Plan assigned to ${selectedMember.name}.`);
      setAssignOpen(false);
      setSelectedMember(null);
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const handleUnassign = async (membershipId: string, name: string) => {
    if (!planId) return;
    try {
      await unassignPlan.mutateAsync({ planId, membershipId });
      toast.success(`Plan removed from ${name}.`);
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const handleDelete = async () => {
    if (!planId) return;
    try {
      await deletePlan.mutateAsync(planId);
      toast.success("Diet plan deleted.");
      navigate("/diet-plans");
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/diet-plans")}>
        <ArrowLeft className="h-4 w-4" />
        Diet Plans
      </Button>

      <PageHeader
        icon={Salad}
        title={plan.title}
        description={`by ${isOwn ? "you" : (plan.creator?.name ?? "Unknown")} · ${formatDate(plan.createdAt)}`}
        actions={
          <>
            {mayEdit && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/diet-plans/${plan.id}/edit`)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
            {canAssign && (
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Assign
              </Button>
            )}
            {mayDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </>
        }
      />

      {(plan.goal || plan.dietType || plan.description) && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {plan.goal && <Badge variant="secondary">{plan.goal}</Badge>}
            {plan.dietType && <Badge variant="outline">{plan.dietType}</Badge>}
          </div>
          {plan.description && (
            <p className="text-sm whitespace-pre-line text-muted-foreground">{plan.description}</p>
          )}
        </div>
      )}

      {/* The day, before the meals that make it up. */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {MACROS.map((macro) => (
              <div
                key={macro.key}
                className={
                  macro.key === "calories"
                    ? "col-span-2 rounded-lg bg-primary/10 px-3 py-2 sm:col-span-1"
                    : "rounded-lg bg-muted/50 px-3 py-2"
                }
              >
                <p className="text-xs text-muted-foreground">{macro.label} / day</p>
                <p className="text-xl font-semibold tabular-nums">
                  {formatAmount(dayTotals[macro.key])}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{macro.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {target > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {formatAmount(dayTotals.calories)} of {formatAmount(target)} kcal target
                </span>
                <span>
                  {dayTotals.calories > target
                    ? `${formatAmount(dayTotals.calories - target)} over`
                    : `${formatAmount(target - dayTotals.calories)} to go`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    dayTotals.calories > target ? "h-full bg-destructive" : "h-full bg-primary"
                  }
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {meals.length === 0 ? (
        <EmptyState icon={Salad} title="No meals yet" description="This plan has no meals in it." />
      ) : (
        <div className="space-y-4">
          {meals.map((meal, mealIndex) => (
            <Card key={mealIndex}>
              <CardHeader className="space-y-2 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    {meal.name}
                    {meal.time && (
                      <span className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {meal.time}
                      </span>
                    )}
                  </CardTitle>
                  <MacroChips values={sumNutrients(meal.foods)} size="xs" />
                </div>
                {meal.notes && <p className="text-sm text-muted-foreground">{meal.notes}</p>}
              </CardHeader>
              <CardContent className="space-y-2">
                {meal.foods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing in this meal.</p>
                ) : (
                  meal.foods.map((food, foodIndex) => {
                    const clickable = Boolean(food.foodItemId);
                    return (
                      <div
                        key={foodIndex}
                        role={clickable ? "link" : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={() => clickable && navigate(`/food-items/${food.foodItemId}`)}
                        onKeyDown={(event) => {
                          if (clickable && event.key === "Enter") {
                            navigate(`/food-items/${food.foodItemId}`);
                          }
                        }}
                        className={
                          clickable
                            ? "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50"
                            : "flex items-center gap-3 rounded-lg border px-3 py-2"
                        }
                      >
                        <FoodPhoto
                          src={food.imageUrl}
                          className="h-14 w-14 shrink-0 rounded-md"
                          iconClassName="h-5 w-5"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate text-sm font-medium">{food.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {servingLabel(food.servingSize, food.servingUnit, food.quantity)}
                            {food.notes ? ` · ${food.notes}` : ""}
                          </p>
                          <MacroChips values={scaleNutrients(food, food.quantity)} size="xs" />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canAssign && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Assigned members ({assignments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignOpen && (
              <div className="space-y-3 rounded-lg border border-primary/30 p-3">
                <Label>Assign to member</Label>
                <MemberSelector
                  members={members}
                  selectedMember={selectedMember}
                  onSelect={setSelectedMember}
                  placeholder="Choose a member..."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAssign}
                    disabled={!selectedMember || assignPlan.isPending}
                  >
                    {assignPlan.isPending ? "Assigning…" : "Assign"}
                  </Button>
                </div>
              </div>
            )}

            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not assigned to anybody yet.</p>
            ) : (
              <div className="space-y-1">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => navigate(`/members/${assignment.membershipId}`)}
                    >
                      <AvatarCard
                        name={assignment.memberName}
                        memberId={assignment.memberId}
                        variant="sm"
                      />
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(assignment.assignedAt)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnassign(assignment.membershipId, assignment.memberName)}
                        disabled={unassignPlan.isPending}
                        aria-label={`Remove plan from ${assignment.memberName}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete diet plan?"
        description="The plan is removed from every member it was assigned to."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
