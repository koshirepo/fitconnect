import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { workoutsApi } from "@/api/workouts";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageLoader } from "@/components/ui/spinner";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Dumbbell, Pencil, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import type { WorkoutPlan, Exercise, TenantMember } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";
import MemberSelector from "@/components/ui/memberSelector";
import { loadAllTenantMembers } from "@/lib/tenant-members";

export default function WorkoutDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { currentTenantId, tenantRole } = useAuthStore();
  const role = tenantRole();
  const canEdit = role === "ADMIN" || role === "COACH";

  const [plan, setPlan] = React.useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // Edit mode
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formTitle, setFormTitle] = React.useState("");
  const [formDesc, setFormDesc] = React.useState("");
  const [formExercises, setFormExercises] = React.useState<Exercise[]>([]);

  // Delete
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Assign
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [selectedMember, setSelectedMember] = React.useState<TenantMember | null>(null);
  const [selectedMemberId, setSelectedMemberId] = React.useState("");
  const [assigning, setAssigning] = React.useState(false);

  const loadPlan = React.useCallback(async () => {
    if (!currentTenantId || !planId) return;
    setLoading(true);
    setError("");
    try {
      const res = await workoutsApi.getById(currentTenantId, planId);
      setPlan(res.data.data.plan);
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, planId]);

  React.useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const startEditing = () => {
    if (!plan) return;
    setFormTitle(plan.title);
    setFormDesc(plan.description ?? "");
    setFormExercises(plan.exercises ?? []);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!currentTenantId || !planId) return;
    setSaving(true);
    setError("");
    try {
      await workoutsApi.update(currentTenantId, planId, {
        title: formTitle,
        description: formDesc || undefined,
        exercises: formExercises.length > 0 ? formExercises : undefined,
      });
      setEditing(false);
      await loadPlan();
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!currentTenantId || !planId) return;
    try {
      await workoutsApi.delete(currentTenantId, planId);
      navigate("/workouts");
    } catch (err: unknown) {
      setError(getApiError(err));
    }
  };

  const openAssign = async () => {
    if (!currentTenantId) return;
    try {
      const allMembers = await loadAllTenantMembers(currentTenantId);
      setMembers(allMembers);
    } catch {
      //
    }
    setSelectedMember(null);
    setSelectedMemberId("");
    setAssignOpen(true);
  };

  const handleAssign = async () => {
    if (!currentTenantId || !planId || !selectedMemberId) return;
    setAssigning(true);
    try {
      await workoutsApi.assign(currentTenantId, planId, selectedMemberId);
      setAssignOpen(false);
      setSelectedMember(null);
      setSelectedMemberId("");
      await loadPlan();
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setAssigning(false);
    }
  };

  // Exercise helpers
  const addExercise = () => {
    setFormExercises([...formExercises, { name: "", sets: 3, reps: 10 }]);
  };

  const updateExercise = (idx: number, field: keyof Exercise, value: string | number) => {
    const updated = [...formExercises];
    (updated[idx] as unknown as Record<string, unknown>)[field] = value;
    setFormExercises(updated);
  };

  const removeExercise = (idx: number) => {
    setFormExercises(formExercises.filter((_, i) => i !== idx));
  };

  if (loading) return <PageLoader />;

  if (!plan) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/workouts")}>
          Back to Workouts
        </Button>
        <EmptyState
          icon={Dumbbell}
          title="Plan not found"
          description={error || "The workout plan could not be loaded."}
        />
      </div>
    );
  }

  const exercises = plan.exercises ?? [];
  const assignments = plan.assignments ?? [];

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => navigate("/workouts")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">{plan.title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            by {plan.creator?.name ?? "Unknown"} · {formatDate(plan.createdAt)}
          </p>
        </div>
        {plan._count && (
          <Badge variant="secondary" className="shrink-0">
            <Users className="h-3 w-3 mr-1" />
            {plan._count.assignments}
          </Badge>
        )}
      </div>

      {/* ── Action buttons ─────────────────────────────────────────── */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {!editing && (
            <>
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={openAssign}>
                <UserPlus className="h-4 w-4" />
                Assign
              </Button>
            </>
          )}
          {editing && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
          {role === "ADMIN" && !editing && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete workout plan?"
        description="This plan and all its assignments will be permanently deleted."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ── Description ───────────────────────────────────────────── */}
      {(plan.description || editing) && (
        <Card>
          <CardContent className="p-4">
            {editing ? (
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Workout description..."
                  rows={3}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {plan.description}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Edit title (only in edit mode) ─────────────────────────── */}
      {editing && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <Label>Title</Label>
            <Input
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Workout plan title"
            />
          </CardContent>
        </Card>
      )}

      {/* ── Exercises ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">
                Exercises ({editing ? formExercises.length : exercises.length})
              </span>
            </div>
            {editing && (
              <Button type="button" variant="outline" size="sm" onClick={addExercise}>
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              {formExercises.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No exercises yet. Click "Add" to get started.
                </p>
              )}
              {formExercises.map((ex, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end rounded-md border p-3">
                  <div className="col-span-12 sm:col-span-4">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={ex.name}
                      onChange={(e) => updateExercise(idx, "name", e.target.value)}
                      placeholder="Bench Press"
                      required
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">Sets</Label>
                    <Input
                      type="number"
                      value={ex.sets ?? ""}
                      onChange={(e) => updateExercise(idx, "sets", parseInt(e.target.value) || 0)}
                      min={1}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-xs">Reps</Label>
                    <Input
                      type="number"
                      value={ex.reps ?? ""}
                      onChange={(e) => updateExercise(idx, "reps", parseInt(e.target.value) || 0)}
                      min={1}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-3">
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
          ) : exercises.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No exercises in this plan.
            </p>
          ) : (
            <div className="space-y-1">
              {exercises.map((ex, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-muted-foreground w-5 text-right tabular-nums">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ex.name}</p>
                      {ex.notes && (
                        <p className="text-xs text-muted-foreground truncate">{ex.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-sm">
                    {ex.sets != null && (
                      <Badge variant="outline" className="text-xs">
                        {ex.sets} sets
                      </Badge>
                    )}
                    {ex.reps != null && (
                      <Badge variant="outline" className="text-xs">
                        {ex.reps} reps
                      </Badge>
                    )}
                    {ex.durationMinutes != null && (
                      <Badge variant="outline" className="text-xs">
                        {ex.durationMinutes} min
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Assigned Members ──────────────────────────────────────── */}
      {assignments.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Assigned Members ({assignments.length})</span>
            </div>
            <div className="space-y-1">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/members/${a.membershipId}`)}
                >
                  <AvatarCard name={a.memberName} memberId={a.memberId} variant="sm" />
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDate(a.assignedAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Assign Dialog ─────────────────────────────────────────── */}
      {assignOpen && (
        <Card className="border-primary/30">
          <CardContent className="p-4 space-y-3">
            <Label>Assign to Member</Label>
            <MemberSelector
              members={members}
              selectedMember={selectedMember}
              onSelect={(member) => {
                setSelectedMember(member);
                setSelectedMemberId(member.id);
              }}
              placeholder="Choose a member..."
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAssign} disabled={!selectedMemberId || assigning}>
                {assigning ? "Assigning…" : "Assign"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
