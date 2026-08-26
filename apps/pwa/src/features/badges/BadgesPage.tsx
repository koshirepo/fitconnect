import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import {
  useAssignBadge,
  useBadgeAssignments,
  useBadgesInfinite,
  useDeleteBadge,
} from "@/api/queries/catalog";
import { useAllMembers } from "@/api/queries/members";
import { flattenPages } from "@/api/queries/shared";
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
import { Spinner } from "@/components/ui/spinner";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Plus, Award, Trash2, UserPlus, Edit, Users } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import type { Badge, TenantMember } from "@/types/api";

export default function BadgesPage() {
  const navigate = useAppNavigate();
  const { currentTenantId } = useAuthStore();
  const { can } = usePermissions();
  // Badge authoring is a capability, not the ADMIN role: assignment is a
  // separate grant that coaches hold by default.
  const isAdmin = can(Permission.BADGES_CREATE);
  const canAssignBadges = can(Permission.BADGES_ASSIGN);

  // ─── Badge list ─────────────────────────────────────────────────────────────
  // Authors see inactive badges too, so the flag is part of the cache key.
  const badgesQuery = useBadgesInfinite({ includeInactive: isAdmin });
  const badges = React.useMemo(
    () => flattenPages<Badge>(badgesQuery.data?.pages),
    [badgesQuery.data],
  );
  const loading = badgesQuery.isLoading;
  const loadingMore = badgesQuery.isFetchingNextPage;
  const hasMore = Boolean(badgesQuery.hasNextPage);

  const deleteBadge = useDeleteBadge();
  const assignBadge = useAssignBadge();

  // ─── Assign dialog state ────────────────────────────────────────────────────
  const [assignDialog, setAssignDialog] = React.useState(false);
  const [assignBadgeId, setAssignBadgeId] = React.useState<string | null>(null);
  const [assignBadgeName, setAssignBadgeName] = React.useState("");
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
  const [viewBadgeId, setViewBadgeId] = React.useState<string | null>(null);

  const assignmentsQuery = useBadgeAssignments(viewBadgeId);
  const viewAssignments = assignmentsQuery.data?.assignments ?? [];

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (badgesQuery.hasNextPage && !badgesQuery.isFetchingNextPage) {
        void badgesQuery.fetchNextPage();
      }
    },
  });

  // ─── Delete handler ─────────────────────────────────────────────────────────
  const handleDelete = (badgeId: string) => {
    if (!currentTenantId) return;
    setPendingDeleteId(badgeId);
    setConfirmOpen(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!currentTenantId || !pendingDeleteId) return;
    try {
      await deleteBadge.mutateAsync(pendingDeleteId);
    } catch {
      //
    } finally {
      setPendingDeleteId(null);
    }
  };

  // The roster the picker chooses from. Fetched only once the dialog is opened,
  // and shared with every other screen that reads the same query, so a second
  // assignment costs nothing.
  const rosterQuery = useAllMembers({ enabled: assignDialog });
  const members = React.useMemo(
    () => (rosterQuery.data ?? []).filter((member) => member.status === "ACTIVE"),
    [rosterQuery.data],
  );

  // ─── Assign handlers ───────────────────────────────────────────────────────
  const openAssign = (badgeId: string, badgeName: string) => {
    if (!currentTenantId) return;
    setAssignBadgeId(badgeId);
    setAssignBadgeName(badgeName);
    setSelectedMember(null);
    setSelectedMemberId("");
    setAssignNote("");
    setAssignError("");
    setAssignDialog(true);
  };

  const handleAssign = async () => {
    if (!currentTenantId || !assignBadgeId || !selectedMemberId) return;
    setAssignError("");
    setAssignSubmitting(true);
    try {
      await assignBadge.mutateAsync({
        badgeId: assignBadgeId,
        data: { membershipId: selectedMemberId },
      });
      setAssignDialog(false);
    } catch (err) {
      setAssignError(getApiError(err));
    } finally {
      setAssignSubmitting(false);
    }
  };

  // ─── View assignments ───────────────────────────────────────────────────────
  // Selecting a badge enables the query; closing the dialog clears the id and
  // disables it again, so the list is fetched on demand and then cached.
  const openViewAssignments = (badgeId: string, badgeName: string) => {
    setViewBadgeName(badgeName);
    setViewBadgeId(badgeId);
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
        <CardsGridSkeleton count={6} className="gap-4" />
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
                  {(isAdmin || canAssignBadges) && (
                    <div className="flex gap-2 flex-wrap">
                      {can(Permission.BADGES_UPDATE) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/badges/${badge.id}/edit`)}
                        >
                          <Edit className="h-3 w-3" />
                          Edit
                        </Button>
                      )}
                      {canAssignBadges && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssign(badge.id, badge.name)}
                        >
                          <UserPlus className="h-3 w-3" />
                          Assign
                        </Button>
                      )}
                      {can(Permission.BADGES_ASSIGNMENTS_READ) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openViewAssignments(badge.id, badge.name)}
                        >
                          <Users className="h-3 w-3" />
                          View
                        </Button>
                      )}
                      {can(Permission.BADGES_DELETE) && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(badge.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
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
                      gender={a.membership.gender}
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
