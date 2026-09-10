import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
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
import { useAllMembers, useMyProfile } from "@/api/queries/members";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge as BadgeUI } from "@/components/ui/badge";
import AvatarCard from "@/components/ui/avatarCard";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
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

/**
 * Black or white, whichever can actually be read on this fill.
 *
 * Badge colours are chosen by gym staff from a free colour picker, so a pale
 * yellow is as likely as a deep blue. The medallion used to print white on all
 * of them, which made the light ones illegible.
 */
function readableOn(hex: string) {
  const value = hex.replace("#", "").trim();
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#ffffff";

  // Rec. 709 luma. 0.6 is roughly where white text stops carrying on a fill.
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? "#111827" : "#ffffff";
}

/**
 * The badge as a coloured medallion.
 *
 * `icon` is free text — the form calls it a "short identifier" — so it may be a
 * word or an emoji. `charAt(0)` splits a surrogate pair and renders half a
 * character, which is why this spreads to whole code points instead, and keeps
 * a short icon intact rather than reducing an emoji to its first half.
 */
function BadgeMedal({ color, icon, name }: { color: string; icon?: string | null; name: string }) {
  const points = [...(icon?.trim() ?? "")];
  const glyph =
    points.length === 0
      ? name.trim().charAt(0).toUpperCase()
      : points.length <= 2
        ? points.join("")
        : points[0].toUpperCase();

  return (
    <div
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold ring-1 ring-foreground/10"
      style={{ backgroundColor: color, color: readableOn(color) }}
    >
      {glyph}
    </div>
  );
}

export default function BadgesPage() {
  const navigate = useAppNavigate();
  const toast = useToast();
  const { currentTenantId } = useAuthStore();
  const { can } = usePermissions();
  // Badge authoring is a capability, not the ADMIN role: assignment is a
  // separate grant that coaches hold by default.
  const isAdmin = can(Permission.BADGES_CREATE);
  const canAssignBadges = can(Permission.BADGES_ASSIGN);
  const canAssignRestricted = can(Permission.BADGES_ASSIGN_RESTRICTED);

  /**
   * Whether this caller may hand out this particular badge.
   *
   * The API enforces the same rule and is what actually protects it; hiding
   * the button here just avoids offering an action that would be refused.
   */
  const canAssignBadge = (badge: { restricted: boolean }) =>
    canAssignBadges && (!badge.restricted || canAssignRestricted);

  // ─── Badge list ─────────────────────────────────────────────────────────────
  // Authors see inactive badges too, so the flag is part of the cache key.
  const badgesQuery = useBadgesInfinite({ includeInactive: isAdmin });

  // Which of these are actually this member's. Only asked for when it will
  // be used: an admin is looking at the gym's badges, not their own.
  const myProfile = useMyProfile({ enabled: !isAdmin });
  const myBadgeIds = React.useMemo(() => new Set(myProfile.data?.badgeIds ?? []), [myProfile.data]);
  const badges = React.useMemo(
    () => flattenPages<Badge>(badgesQuery.data?.pages),
    [badgesQuery.data],
  );
  /** How many awards these badges account for, across the pages loaded. */
  const totalAwarded = React.useMemo(
    () => badges.reduce((sum, badge) => sum + (badge._count?.assignments ?? 0), 0),
    [badges],
  );
  const loading = badgesQuery.isPending;
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
      toast.success("Badge deleted.");
    } catch (caught) {
      // There is no form banner on this screen, so a swallowed failure would
      // look exactly like a success: the dialog closes and the badge stays.
      toast.error(getApiError(caught));
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
      toast.success(`${assignBadgeName} awarded to ${selectedMember?.name ?? "member"}.`);
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
    <div className="space-y-5 sm:space-y-6">
      {/* Header — the shape every other screen wears: title and subtitle take
          the width, actions stay a fixed block on the right. */}
      <PageHeader
        icon={Award}
        title="Badges"
        description={
          <>
            {isAdmin ? "Recognition you can hand out to members." : "What this gym awards."}
            {badges.length > 0 && (
              <>
                {" "}
                <span className="whitespace-nowrap tabular-nums">
                  {badges.length} badge{badges.length === 1 ? "" : "s"}
                  {/* Only once every page is in: a running total across a
                      half-loaded list would understate the programme. */}
                  {isAdmin && !hasMore && totalAwarded > 0 ? ` · ${totalAwarded} awarded` : ""}
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            {isAdmin && (
              <Button className="shrink-0" onClick={() => navigate("/badges/create")}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New badge</span>
              </Button>
            )}
          </>
        }
      />

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
                <span className="hidden sm:inline">Create Badge</span>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {badges.map((badge) => (
              <Card key={badge.id} className={cn("flex flex-col", !badge.isActive && "opacity-60")}>
                <CardContent className="flex flex-1 items-start gap-3">
                  <BadgeMedal color={badge.color} icon={badge.icon} name={badge.name} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm font-semibold">{badge.name}</p>

                      {/* An admin wants to know how many people hold this. A
                          member wants to know whether *they* do. */}
                      {isAdmin
                        ? badge._count && (
                            <span
                              className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground"
                              title={`${badge._count.assignments} member${
                                badge._count.assignments === 1 ? "" : "s"
                              } hold this badge`}
                            >
                              <Users className="h-3 w-3" />
                              {badge._count.assignments}
                            </span>
                          )
                        : myBadgeIds.has(badge.id) && (
                            <BadgeUI variant="success" className="shrink-0">
                              Earned
                            </BadgeUI>
                          )}
                    </div>

                    {badge.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {badge.description}
                      </p>
                    )}

                    {/* Only rendered when one of them applies, so an ordinary
                        active badge carries no empty row under its name. */}
                    {(!badge.isActive || (badge.restricted && canAssignBadges)) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {!badge.isActive && <BadgeUI variant="warning">Inactive</BadgeUI>}
                        {badge.restricted && canAssignBadges && (
                          <BadgeUI variant="secondary">Admins only</BadgeUI>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>

                {/* Labels from sm up, glyphs on a phone: four labelled buttons
                    wrapped onto three lines at 375px and buried the badge. */}
                {(isAdmin || canAssignBadges) && (
                  <CardFooter className="gap-1">
                    {can(Permission.BADGES_UPDATE) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/badges/${badge.id}/edit`)}
                        aria-label={`Edit ${badge.name}`}
                      >
                        <Edit className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                    )}
                    {canAssignBadge(badge) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAssign(badge.id, badge.name)}
                        aria-label={`Award ${badge.name} to a member`}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Award</span>
                      </Button>
                    )}
                    {can(Permission.BADGES_ASSIGNMENTS_READ) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openViewAssignments(badge.id, badge.name)}
                        aria-label={`See who holds ${badge.name}`}
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Holders</span>
                      </Button>
                    )}
                    {can(Permission.BADGES_DELETE) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-destructive"
                        onClick={() => handleDelete(badge.id)}
                        aria-label={`Delete ${badge.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </CardFooter>
                )}
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
