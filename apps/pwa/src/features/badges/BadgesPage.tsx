import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { badgesApi } from "@/api/badges";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge as BadgeUI } from "@/components/ui/badge";
import AvatarCard from "@/components/ui/avatarCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import MemberSelector from "@/components/ui/memberSelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Award, Trash2, UserPlus, Edit, Users } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { loadAllTenantMembers } from "@/lib/tenant-members";
import type { Badge, TenantMember } from "@/types/api";

export default function BadgesPage() {
  const navigate = useNavigate();
  const { currentTenantId, tenantRole } = useAuthStore();
  const role = tenantRole();
  const isAdmin = role === "ADMIN";

  // ─── Badge list state ───────────────────────────────────────────────────────
  const [badges, setBadges] = React.useState<Badge[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  // ─── Edit dialog state ──────────────────────────────────────────────────────
  const [editDialog, setEditDialog] = React.useState(false);
  const [editingBadge, setEditingBadge] = React.useState<Badge | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editColor, setEditColor] = React.useState("#6366f1");
  const [editIcon, setEditIcon] = React.useState("");
  const [editActive, setEditActive] = React.useState(true);
  const [editError, setEditError] = React.useState("");
  const [editSubmitting, setEditSubmitting] = React.useState(false);

  // ─── Assign dialog state ────────────────────────────────────────────────────
  const [assignDialog, setAssignDialog] = React.useState(false);
  const [assignBadgeId, setAssignBadgeId] = React.useState<string | null>(null);
  const [assignBadgeName, setAssignBadgeName] = React.useState("");
  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [selectedMember, setSelectedMember] = React.useState<TenantMember | null>(null);
  const [selectedMemberId, setSelectedMemberId] = React.useState("");
  const [assignNote, setAssignNote] = React.useState("");
  const [assignError, setAssignError] = React.useState("");
  const [assignSubmitting, setAssignSubmitting] = React.useState(false);

  // ─── View assignments dialog ────────────────────────────────────────────────
  const [viewDialog, setViewDialog] = React.useState(false);

  // ─── Delete confirm ─────────────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [viewBadgeName, setViewBadgeName] = React.useState("");
  const [viewAssignments, setViewAssignments] = React.useState<
    {
      membership?: {
        id: string;
        name: string;
        email: string;
        avatarUrl?: string | null;
        memberId?: number;
      };
    }[]
  >([]);

  // ─── Fetch badges ──────────────────────────────────────────────────────────
  const fetchBadges = React.useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!currentTenantId) return;
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await badgesApi.list(currentTenantId, nextPage, 20, isAdmin);
        const nextBadges = res.data.data;
        setBadges((prev) => (mode === "replace" ? nextBadges : appendUniqueById(prev, nextBadges)));
        const totalPages = res.data.meta.totalPages;
        setHasMore(nextPage < totalPages);
        setPage(nextPage);
      } catch {
        //
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [currentTenantId, isAdmin],
  );

  React.useEffect(() => {
    if (!currentTenantId) return;
    setBadges([]);
    setHasMore(true);
    void fetchBadges(1, "replace");
  }, [currentTenantId, isAdmin, fetchBadges]);

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchBadges(page + 1, "append");
  }, [loading, loadingMore, hasMore, page, fetchBadges]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  // ─── Edit handlers ──────────────────────────────────────────────────────────
  const openEdit = (badge: Badge) => {
    setEditingBadge(badge);
    setEditName(badge.name);
    setEditDescription(badge.description ?? "");
    setEditColor(badge.color);
    setEditIcon(badge.icon ?? "");
    setEditActive(badge.isActive);
    setEditError("");
    setEditDialog(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId || !editingBadge) return;
    setEditError("");
    setEditSubmitting(true);
    try {
      await badgesApi.update(currentTenantId, editingBadge.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        color: editColor,
        icon: editIcon.trim() || undefined,
        isActive: editActive,
      });
      setEditDialog(false);
      fetchBadges(1, "replace");
    } catch (err) {
      setEditError(getApiError(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  // ─── Delete handler ─────────────────────────────────────────────────────────
  const handleDelete = (badgeId: string) => {
    if (!currentTenantId) return;
    setPendingDeleteId(badgeId);
    setConfirmOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!currentTenantId || !pendingDeleteId) return;
    try {
      await badgesApi.delete(currentTenantId, pendingDeleteId);
      fetchBadges(1, "replace");
    } catch {
      //
    } finally {
      setPendingDeleteId(null);
    }
  };

  // ─── Assign handlers ───────────────────────────────────────────────────────
  const openAssign = async (badgeId: string, badgeName: string) => {
    if (!currentTenantId) return;
    setAssignBadgeId(badgeId);
    setAssignBadgeName(badgeName);
    setSelectedMember(null);
    setSelectedMemberId("");
    setAssignNote("");
    setAssignError("");
    try {
      const allMembers = await loadAllTenantMembers(currentTenantId, {
        status: "ACTIVE",
      });
      setMembers(allMembers);
    } catch {
      //
    }
    setAssignDialog(true);
  };

  const handleAssign = async () => {
    if (!currentTenantId || !assignBadgeId || !selectedMemberId) return;
    setAssignError("");
    setAssignSubmitting(true);
    try {
      await badgesApi.assign(currentTenantId, assignBadgeId, {
        membershipId: selectedMemberId,
      });
      setAssignDialog(false);
      fetchBadges(1, "replace");
    } catch (err) {
      setAssignError(getApiError(err));
    } finally {
      setAssignSubmitting(false);
    }
  };

  // ─── View assignments ───────────────────────────────────────────────────────
  const openViewAssignments = async (badgeId: string, badgeName: string) => {
    if (!currentTenantId) return;
    setViewBadgeName(badgeName);
    try {
      const res = await badgesApi.listAssignments(currentTenantId, badgeId);
      setViewAssignments(res.data.data.assignments);
    } catch {
      setViewAssignments([]);
    }
    setViewDialog(true);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Badges</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Create and manage badges for your members" : "View available badges"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/badges/create")}>
            <Plus className="h-4 w-4" />
            New Badge
          </Button>
        )}
      </div>

      {/* Badge Grid */}
      {loading ? (
        <PageLoader />
      ) : badges.length === 0 ? (
        <EmptyState
          icon={Award}
          title="No badges yet"
          description={
            isAdmin
              ? "Create your first badge to reward and recognize members."
              : "No badges available yet."
          }
          action={
            isAdmin ? (
              <Button onClick={() => navigate("/badges/create")}>
                <Plus className="h-4 w-4" />
                Create Badge
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((badge) => (
              <Card key={badge.id} className={!badge.isActive ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-white text-lg font-bold"
                        style={{ backgroundColor: badge.color }}
                      >
                        {badge.icon
                          ? badge.icon.charAt(0).toUpperCase()
                          : badge.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-base">{badge.name}</CardTitle>
                        {!badge.isActive && (
                          <BadgeUI variant="warning" className="mt-0.5">
                            Inactive
                          </BadgeUI>
                        )}
                      </div>
                    </div>
                    {badge._count && (
                      <BadgeUI variant="secondary">{badge._count.assignments} assigned</BadgeUI>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {badge.description && (
                    <p className="text-sm text-muted-foreground mb-3">{badge.description}</p>
                  )}

                  {/* Color preview */}
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="h-4 w-4 rounded-full border"
                      style={{ backgroundColor: badge.color }}
                    />
                    <span className="text-xs text-muted-foreground">{badge.color}</span>
                  </div>

                  {/* Actions */}
                  {isAdmin && (
                    <div className="flex gap-2 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => openEdit(badge)}>
                        <Edit className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAssign(badge.id, badge.name)}
                      >
                        <UserPlus className="h-3 w-3" />
                        Assign
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openViewAssignments(badge.id, badge.name)}
                      >
                        <Users className="h-3 w-3" />
                        View
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(badge.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          {badges.length > 0 && (hasMore || loadingMore) && (
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

      {/* ─── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Badge</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Badge name"
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                maxLength={500}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border p-0.5"
                  />
                  <Input
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    placeholder="#6366f1"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Icon ID</Label>
                <Input
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  placeholder="Optional"
                  maxLength={50}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              <Label htmlFor="edit-active">Active</Label>
            </div>

            {editError && <p className="text-sm text-destructive">{editError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Update Badge"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Assign Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign &ldquo;{assignBadgeName}&rdquo;</DialogTitle>
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
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="e.g. Awarded for 100 gym sessions"
                maxLength={500}
              />
            </div>

            {assignError && <p className="text-sm text-destructive">{assignError}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssign} disabled={!selectedMemberId || assignSubmitting}>
                {assignSubmitting ? "Assigning..." : "Assign Badge"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── View Assignments Dialog ─────────────────────────────────────────── */}
      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Members with &ldquo;{viewBadgeName}&rdquo;</DialogTitle>
          </DialogHeader>
          {viewAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No members assigned yet.
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2">
              {viewAssignments.map((a) => (
                <div
                  key={a.membership?.id ?? `${viewBadgeName}-${a.membership?.email ?? "member"}`}
                  className="rounded-md border px-3 py-2"
                >
                  {a.membership ? (
                    <AvatarCard
                      name={a.membership.name}
                      avatarUrl={a.membership.avatarUrl}
                      memberId={a.membership.memberId}
                      variant="sm"
                    >
                      <p className="text-xs text-muted-foreground truncate">{a.membership.email}</p>
                    </AvatarCard>
                  ) : (
                    <p className="text-sm text-muted-foreground">Member details unavailable</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete badge?"
        description="All member assignments for this badge will also be removed."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
