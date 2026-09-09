/**
 * Documentation: The platform's occupation list.
 *
 * - One list, shared by every gym: what a member does for a living, as offered on the admission form.
 * - Editing is platform-only (`platform:occupations:manage`); reading is open to any signed-in session, because every member form draws this picker.
 * - Retiring a row is the ordinary way to remove one: it keeps the occupation on the members who hold it and stops offering it to new ones. Deleting is only possible while nobody holds it, and the API refuses otherwise.
 * - Sort order is a plain number rather than drag-and-drop: the list is a dozen rows edited a few times a year, and a number is legible in a way a drag handle on a phone is not.
 * - Primary exports: OccupationsPage.
 */
import * as React from "react";
import { getApiError } from "@/api/client";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import {
  useCreateOccupation,
  useDeleteOccupation,
  useOccupations,
  useUpdateOccupation,
} from "@/api/queries/occupations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { OCCUPATION_ICON_KEYS } from "@/lib/occupation";
import { OccupationGlyph } from "@/components/ui/occupation-glyph";
import { Briefcase, Plus, Trash2, Users } from "lucide-react";
import type { Occupation } from "@/types/api";

/** A blank row, and what a new one starts as. */
const EMPTY_DRAFT = { name: "", icon: "briefcase", isActive: true, sortOrder: 0 };

type Draft = typeof EMPTY_DRAFT;

export default function OccupationsPage() {
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can(Permission.PLATFORM_OCCUPATIONS_MANAGE);

  // The manage screen wants the retired rows too, and the member counts that
  // say whether retiring or deleting is the right move.
  const query = useOccupations({ includeInactive: true, withCounts: true });
  const occupations = query.data ?? [];

  const createOccupation = useCreateOccupation();
  const updateOccupation = useUpdateOccupation();
  const deleteOccupation = useDeleteOccupation();

  const [editing, setEditing] = React.useState<Occupation | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<Occupation | null>(null);

  const openCreate = () => {
    setEditing(null);
    // A new row lands at the end rather than in the middle of the list.
    setDraft({
      ...EMPTY_DRAFT,
      sortOrder: (occupations.at(-1)?.sortOrder ?? 0) + 10,
    });
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (occupation: Occupation) => {
    setEditing(occupation);
    setDraft({
      name: occupation.name,
      icon: occupation.icon ?? "briefcase",
      isActive: occupation.isActive,
      sortOrder: occupation.sortOrder,
    });
    setFormError("");
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    try {
      if (editing) {
        await updateOccupation.mutateAsync({ occupationId: editing.id, data: draft });
        toast.success(`${draft.name} saved.`);
      } else {
        await createOccupation.mutateAsync(draft);
        toast.success(`${draft.name} added.`);
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(getApiError(err));
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    try {
      await deleteOccupation.mutateAsync(pendingDelete.id);
      toast.success(`${pendingDelete.name} deleted.`);
    } catch (err) {
      // The usual failure is "somebody holds it", which is worth reading.
      toast.error(getApiError(err));
    } finally {
      setPendingDelete(null);
    }
  };

  if (query.isLoading) return <ListPageSkeleton />;

  if (query.isError) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Could not load occupations"
        description={getApiError(query.error)}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Briefcase className="h-6 w-6" />
            Occupations
          </h1>
          <p className="text-sm text-muted-foreground">
            What members do for a living, as every gym's admission form offers it.
          </p>
        </div>
        {canManage && (
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Occupation
          </Button>
        )}
      </div>

      {occupations.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No occupations yet"
          description="Add the first one and it appears on every gym's member form."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {occupations.map((occupation) => {
            const holders = occupation.memberCount ?? 0;

            return (
              <Card
                key={occupation.id}
                className={cn("py-0", !occupation.isActive && "opacity-60")}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <OccupationGlyph icon={occupation.icon} className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{occupation.name}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {holders} {holders === 1 ? "member" : "members"}
                      {!occupation.isActive && " · not offered"}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(occupation)}
                      >
                        Edit
                      </Button>
                      {/* Only offered while nobody holds it — the API refuses
                          the rest, and a button that always fails is noise. */}
                      {holders === 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${occupation.name}`}
                          onClick={() => setPendingDelete(occupation)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New occupation"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="occupation-name">Name</Label>
              <Input
                id="occupation-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Student"
                required
                minLength={2}
                maxLength={60}
                autoFocus
              />
            </div>

            {/* The curated set this build can draw. Anything else would render
                as a briefcase on every member's record. */}
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto rounded-md border p-2">
                {OCCUPATION_ICON_KEYS.map((key) => {
                  const selected = draft.icon === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={key}
                      aria-pressed={selected}
                      onClick={() => setDraft({ ...draft, icon: key })}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-md transition-colors hover:bg-accent",
                        selected && "bg-primary/10 text-primary ring-1 ring-primary",
                      )}
                    >
                      <OccupationGlyph icon={key} className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="occupation-order">Order</Label>
                <Input
                  id="occupation-order"
                  type="number"
                  min={0}
                  max={10000}
                  value={draft.sortOrder}
                  onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">Lowest first.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="occupation-active">Offered</Label>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <input
                    id="occupation-active"
                    type="checkbox"
                    checked={draft.isActive}
                    onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                    className="size-4"
                  />
                  Show on member forms
                </label>
                <p className="text-xs text-muted-foreground">
                  Turning this off keeps it on the members who already have it.
                </p>
              </div>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createOccupation.isPending || updateOccupation.isPending}
              >
                {editing ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? "occupation"}?`}
        description="Nobody holds this one, so nothing on a member's record changes. It stops being offered everywhere."
        confirmLabel="Delete"
        loading={deleteOccupation.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
