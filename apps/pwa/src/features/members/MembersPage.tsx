import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useAllMembers, useRemoveMember } from "@/api/queries/members";
import { useBadges, useTenantSettings } from "@/api/queries/catalog";
import { useTenantRoleMatrix } from "@/api/queries/roles";
import { useLogReminder } from "@/api/queries/reminders";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MemberCard, PersonChip } from "@/components/ui/member-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonRow } from "@/components/ui/skeleton";
import { SwipePane } from "@/components/ui/swipe-pane";
import { downloadCsv } from "@/lib/csv";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import {
  getTenantWhatsAppTemplateBody,
  renderWhatsAppTemplateBody,
} from "@/lib/whatsapp-templates";
import {
  Plus,
  Users,
  Search,
  X,
  Download,
  AlertCircle,
  Edit2,
  MessageSquare,
  AlertTriangle,
  Clock,
  Ban,
  CheckCircle2,
  IndianRupee,
} from "lucide-react";
import type { TenantMember } from "@/types/api";
import { usePendingMutations } from "@/lib/use-pending-mutations";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { GENDER_OPTIONS } from "@/lib/gender";
import { getApiError } from "@/api/client";
import { useToast } from "@/components/ui/toast";

type PendingMemberMutationBody = {
  name?: string;
  email?: string;
  phone?: string | null;
  gender?: TenantMember["gender"];
  role?: TenantMember["role"];
};

type DisplayMember = TenantMember & { _pending?: boolean };

// ─── Status & role config ──────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: "", label: "All", icon: Users, iconClass: "text-blue-600" },
  { value: "ACTIVE", label: "Active", icon: CheckCircle2, iconClass: "text-emerald-600" },
  { value: "INACTIVE", label: "Inactive", icon: Ban, iconClass: "text-muted-foreground" },
  { value: "PENDING", label: "Pending", icon: Clock, iconClass: "text-amber-600" },
  { value: "DUE", label: "Due", icon: AlertCircle, iconClass: "text-red-600" },
];

/**
 * Whether a member belongs under one status tab.
 *
 * Shared by the list and the tab counts, so a number can never disagree with
 * the rows it claims to count.
 */
function matchesStatusTab(member: DisplayMember, statusTab: string, now: Date) {
  if (statusTab === "ACTIVE") return member.status === "ACTIVE";

  if (statusTab === "INACTIVE") {
    const statusValue = String(member.status).toUpperCase();
    return statusValue === "SUSPENDED" || statusValue === "INACTIVE";
  }

  // A payment was started and never completed — a self-signup that closed
  // the checkout window, or a row the desk recorded as pending.
  if (statusTab === "PENDING") return Boolean(member.hasPendingPayment);

  if (statusTab === "DUE") {
    const due = member.isDue ?? (member.dueDate ? new Date(member.dueDate) <= now : false);
    return due && member.status === "ACTIVE";
  }

  // The "All" tab.
  return true;
}

export default function MembersPage() {
  const navigate = useAppNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId, currentMembership } = useAuthStore();
  const { can } = usePermissions();
  const gymName = currentMembership()?.tenantName ?? "the gym";
  // Gates the admin-only member operations (status, role, delete, reports).
  const isAdmin = can(Permission.MEMBERS_STATUS_UPDATE);
  const canAddMember = can(Permission.MEMBERS_CREATE);

  // All assignable roles — the built-ins plus any custom roles the gym created.
  // Only for a caller allowed to read them: the endpoint answers 403 to anyone
  // else, and a coach opening this screen would spend a request on being told
  // no every time.
  const roleMatrix = useTenantRoleMatrix(
    can(Permission.ROLES_READ) ? currentTenantId : null,
  ).data;
  const assignableRoles = React.useMemo(
    () => (roleMatrix?.roles ?? []).filter((role) => !role.isSystem || ["MEMBER", "COACH", "ADMIN"].includes(role.role)),
    [roleMatrix],
  );

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingRemoveId, setPendingRemoveId] = React.useState<string | null>(null);

  // Read filters from URL
  const roleFilter = searchParams.get("role") ?? "MEMBER";
  const statusFilter = searchParams.get("status") ?? "";
  const badgeFilter = searchParams.get("badge") ?? "";
  const genderFilter = searchParams.get("gender") ?? "";
  const search = searchParams.get("search") ?? "";

  const updateParams = React.useCallback(
    (updates: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value) {
              next.set(key, value);
            } else {
              next.delete(key);
            }
          }
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Three independent reads; react-query runs them in parallel and dedupes them
  // against whatever other screens have already requested.
  const membersQuery = useAllMembers();
  const badgesQuery = useBadges();
  const settingsQuery = useTenantSettings();

  const members = React.useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const badges = React.useMemo(() => badgesQuery.data ?? [], [badgesQuery.data]);
  const tenantSettings = settingsQuery.data ?? null;
  // `isPending`, not `isLoading`: the query is disabled until the tenant id
  // resolves, and a disabled query reports `isLoading: false` with no data — so
  // this screen would flash "No members found" before the first fetch even
  // starts. `isPending` is false the moment data exists, including data the
  // persisted cache restored, so a warm reload still shows no skeleton.
  // Also covers a refetch that has nothing to show yet: `useAllMembers` passes
  // `forceRefresh`, so an invalidation re-reads every page, and until the first
  // one lands there are no rows to render.
  // Guarded by the tenant id: with no gym selected the query never runs, and a
  // query that never runs stays `pending` forever — which showed a skeleton
  // that never resolved for anyone signed in without a membership.
  const loading =
    Boolean(currentTenantId) &&
    (membersQuery.isPending || (membersQuery.isFetching && members.length === 0));

  const removeMember = useRemoveMember();
  // A WhatsApp reminder is the one chase the server cannot see, so the app
  // records it as the link opens. Failing to record never blocks the send.
  const logReminder = useLogReminder();

  const paymentReminderTemplateBody = React.useMemo(
    () => getTenantWhatsAppTemplateBody(tenantSettings, "payment_reminder"),
    [tenantSettings],
  );

  const getPaymentReminderText = React.useCallback(
    (member: TenantMember) =>
      renderWhatsAppTemplateBody(paymentReminderTemplateBody, {
        memberName: member.name,
        gymName,
        expirySuffix: member.dueDate ? ` on ${formatDate(member.dueDate)}` : "",
      }),
    [paymentReminderTemplateBody, gymName],
  );

  const getPaymentReminderUrl = React.useCallback(
    (member: TenantMember) => buildWhatsAppUrl(member.phone, getPaymentReminderText(member)),
    [getPaymentReminderText],
  );

  const pendingReminderTemplateBody = React.useMemo(
    () => getTenantWhatsAppTemplateBody(tenantSettings, "pending_payment_reminder"),
    [tenantSettings],
  );

  const getPendingPaymentReminderText = React.useCallback(
    (member: TenantMember) =>
      renderWhatsAppTemplateBody(pendingReminderTemplateBody, {
        memberName: member.name,
        gymName,
        amountLine:
          member.pendingPaymentAmount !== undefined
            ? ` The outstanding amount is ${formatCurrency(member.pendingPaymentAmount)}.`
            : "",
      }),
    [pendingReminderTemplateBody, gymName],
  );

  const getPendingPaymentReminderUrl = React.useCallback(
    (member: TenantMember) =>
      buildWhatsAppUrl(member.phone, getPendingPaymentReminderText(member)),
    [getPendingPaymentReminderText],
  );

  // Pending offline members
  const pendingMembers = usePendingMutations<PendingMemberMutationBody>("/members");
  const pendingMemberItems: DisplayMember[] = pendingMembers.map((m) => ({
    id: `pending-${m.id}`,
    memberId: 0,
    userId: "",
    name: m.body?.name ?? "New Member",
    email: m.body?.email ?? "",
    phone: m.body?.phone ?? null,
    gender: m.body?.gender ?? null,
    avatarUrl: null,
    role: m.body?.role ?? "MEMBER",
    status: "ACTIVE" as const,
    joinedAt: new Date(m.createdAt).toISOString(),
    _pending: true as const,
  }));

  /**
   * Everything matching the role, badge, and search filters — but not the
   * status tab. The tab counts are taken from here, so each tab reports how
   * many rows it would show under the filters already applied rather than a
   * gym-wide total that does not match what clicking it produces.
   */
  const scopedMembers: DisplayMember[] = React.useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();

    return [...pendingMemberItems, ...members]
      .filter((member) => {
        if (roleFilter && member.role !== roleFilter) return false;
        if (genderFilter && member.gender !== genderFilter) return false;

        if (badgeFilter) {
          const badgeIds = (member as DisplayMember & { badgeIds?: string[]; badges?: { id: string }[] })
            .badgeIds ??
            ((member as DisplayMember & { badges?: { id: string }[] })?.badges ?? [])
              .map((badge) => badge.id);

          const hasBadgeData =
            "badgeIds" in member ||
            "badges" in member ||
            (Array.isArray(badgeIds) && badgeIds.length > 0);

          if (hasBadgeData && !badgeIds.includes(badgeFilter)) return false;
        }

        if (!trimmedSearch) return true;

        const searchableText = `${member.name} ${member.email} ${member.phone ?? ""} ${member.memberId ?? ""}`.toLowerCase();
        return searchableText.includes(trimmedSearch);
      })
      .sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());
  }, [badgeFilter, genderFilter, members, pendingMemberItems, roleFilter, search]);

  /** How many rows each tab holds, for the numbers beside the tab labels. */
  const statusCounts = React.useMemo(() => {
    const now = new Date();
    const counts: Record<string, number> = {};
    for (const tab of STATUS_TABS) {
      counts[tab.value] = scopedMembers.filter((member) =>
        matchesStatusTab(member, tab.value, now),
      ).length;
    }
    return counts;
  }, [scopedMembers]);

  const filteredAllMembers: DisplayMember[] = React.useMemo(() => {
    const now = new Date();
    return scopedMembers.filter((member) => matchesStatusTab(member, statusFilter, now));
  }, [scopedMembers, statusFilter]);

  // Swiping moves along the same tab strip the taps use, so the two can never
  // disagree about what comes next.
  const statusTabIndex = Math.max(
    STATUS_TABS.findIndex((tab) => tab.value === statusFilter),
    0,
  );

  const goToTab = React.useCallback(
    (offset: number) => {
      const next = STATUS_TABS[statusTabIndex + offset];
      if (next) updateParams({ status: next.value });
    },
    [statusTabIndex, updateParams],
  );

  const hasActiveFilters = Boolean(
    statusFilter || badgeFilter || genderFilter || search.trim() || roleFilter !== "MEMBER",
  );

  const clearFilters = () =>
    updateParams({ status: "", badge: "", gender: "", search: "", role: "MEMBER" });

  const recordWhatsApp = (
    member: DisplayMember,
    reason: "PENDING_PAYMENT" | "RENEWAL_DUE",
    message: string | null,
  ) => {
    if (member._pending) return;
    logReminder.mutate({
      membershipId: member.id,
      payload: { channel: "WHATSAPP", reason, ...(message ? { message } : {}) },
    });
  };

  const renderMemberActions = (m: DisplayMember) => (
    <>
      {!m._pending && m.hasPendingPayment && m.phone && (
        <a
          href={getPendingPaymentReminderUrl(m) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          title="Remind about the pending payment via WhatsApp"
          onClick={() => recordWhatsApp(m, "PENDING_PAYMENT", getPendingPaymentReminderText(m))}
        >
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-8 rounded-full text-amber-600 hover:bg-amber-50 hover:text-amber-700 sm:size-9"
          >
            <IndianRupee className="size-4 sm:size-5" />
          </Button>
        </a>
      )}
      {!m._pending && m.isDue && m.phone && (
        <a
          href={getPaymentReminderUrl(m) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          title="Send payment reminder via WhatsApp"
          onClick={() => recordWhatsApp(m, "RENEWAL_DUE", getPaymentReminderText(m))}
        >
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-8 rounded-full text-yellow-600 hover:bg-yellow-50 hover:text-yellow-700 sm:size-9"
          >
            <AlertTriangle className="size-4 sm:size-5" />
          </Button>
        </a>
      )}
      {!m._pending && (
        <Button
          variant="ghost"
          size="icon-lg"
          className="size-8 rounded-full text-muted-foreground hover:text-foreground sm:size-9"
          onClick={() => navigate(getTenantDashboardPath(`/members/${m.id}/edit`))}
          title="Edit member"
        >
          <Edit2 className="size-4 sm:size-5" />
        </Button>
      )}
      {!m._pending && m.phone && (
        <a
          href={buildWhatsAppUrl(m.phone, `Hi ${m.name}`) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          title="Chat on WhatsApp"
        >
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-8 rounded-full text-muted-foreground hover:text-foreground sm:size-9"
          >
            <MessageSquare className="size-4 sm:size-5" />
          </Button>
        </a>
      )}
    </>
  );

  const handleRemoveConfirmed = async () => {
    if (!currentTenantId || !pendingRemoveId) return;
    try {
      await removeMember.mutateAsync(pendingRemoveId);
      toast.success("Member removed.");
    } catch (caught) {
      // Removing a member is destructive and irreversible from this screen, so
      // a failure has to say so rather than leaving the row quietly in place.
      toast.error(getApiError(caught));
    } finally {
      setPendingRemoveId(null);
    }
  };

  /**
   * Export exactly the rows on screen.
   *
   * The list is already filtered and already in memory, so the file always
   * matches what the person looking at it can see — and it costs no requests,
   * where this used to re-download the entire roster a page at a time and
   * ignore every filter.
   */
  const handleExportMembers = () => {
    if (!isAdmin) return;

    const rows = filteredAllMembers
      // Offline rows have no server id yet; exporting a placeholder id would
      // put a member in the file who does not exist anywhere else.
      .filter((member) => !member._pending)
      .map((member) => ({
        MemberId: member.id,
        UserId: member.userId,
        Name: member.name,
        Email: member.email,
        Phone: member.phone ?? "",
        Gender: member.gender ?? "",
        Role: member.role,
        Status: member.status,
        JoinedAt: member.joinedAt,
      }));

    if (rows.length === 0) return;

    // Name the file after the filters, so two exports taken minutes apart are
    // still tellable apart in a downloads folder.
    const parts = [
      "members",
      roleFilter ? roleFilter.toLowerCase() : "",
      statusFilter ? statusFilter.toLowerCase() : "",
      genderFilter ? genderFilter.toLowerCase() : "",
      badgeFilter ? badges.find((b) => b.id === badgeFilter)?.name : "",
      search.trim() ? "search" : "",
      new Date().toISOString().slice(0, 10),
    ].filter(Boolean);

    downloadCsv(
      `${parts.join("-").replace(/\s+/g, "-").toLowerCase()}.csv`,
      ["MemberId", "UserId", "Name", "Email", "Phone", "Gender", "Role", "Status", "JoinedAt"],
      rows,
    );
  };

  // if (loading && members.length === 0) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">Manage gym members</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleExportMembers}
              disabled={loading || filteredAllMembers.length === 0}
              title="Download these members as CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {canAddMember && (
            <Button onClick={() => navigate(getTenantDashboardPath("/members/add"))}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="overflow-x-auto overflow-y-hidden border-b border-border">
        {/* Without labels the five tabs fit a phone, so they spread across the
            full width instead of bunching at the left with dead space after. */}
        <div className="flex justify-between gap-2 sm:min-w-max sm:justify-start sm:gap-8">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => updateParams({ status: tab.value })}
                // The label is hidden on a phone, so the tab still needs a name.
                title={tab.label}
                aria-label={tab.label}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 pt-1 pb-3 text-sm transition-colors sm:gap-2",
                  active
                    ? "border-foreground font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? tab.iconClass : "text-muted-foreground")} />
                {/* Icon and count alone on mobile: five labelled tabs do not fit
                    across a phone without scrolling past the last of them. */}
                <span className="hidden sm:inline">{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                    active ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {statusCounts[tab.value] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, phone, email, or admission no..."
            value={search}
            onChange={(e) => updateParams({ search: e.target.value })}
            className="h-12 w-full rounded-lg border border-input bg-background pr-10 pl-12 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
          />
          {search && (
            <button
              onClick={() => updateParams({ search: "" })}
              className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* One row at every width. Equal columns rather than auto-width so the
            three stay aligned as their selected labels change length. */}
        <div className="grid w-full grid-cols-3 gap-2 sm:gap-3">
          <Select value={roleFilter} onValueChange={(value) => updateParams({ role: value ?? "" })}>
            <SelectTrigger className="h-12 w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Roles</SelectItem>
              {assignableRoles.map((role) => (
                <SelectItem key={role.role} value={role.role}>
                  {role.label}
                  {role.isSystem && role.role === "COACH" ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {badges.length > 0 && (
            <Select value={badgeFilter} onValueChange={(value) => updateParams({ badge: value ?? "" })}>
              <SelectTrigger className="h-12 w-full rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Badges</SelectItem>
                {badges.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={genderFilter}
            onValueChange={(value) => updateParams({ gender: value ?? "" })}
          >
            <SelectTrigger className="h-12 w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Genders</SelectItem>
              {GENDER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <SwipePane
        paneKey={statusFilter}
        paneIndex={statusTabIndex}
        onNext={() => goToTab(1)}
        onPrevious={() => goToTab(-1)}
      >
      {loading ? (
        <div className="space-y-3">
          {[0,1,2,3,4].map((i) => (
            <div key={i} className="rounded-lg ring-1 ring-foreground/10"><SkeletonRow className="p-3" /></div>
          ))}
        </div>
      ) : filteredAllMembers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasActiveFilters ? "No members match these filters" : "No members found"}
          description={
            hasActiveFilters
              ? "Nobody on the roster matches every filter you have set. Clear them to see the full list."
              : "Add members to your gym to get started."
          }
          action={
            hasActiveFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear filters
              </Button>
            ) : canAddMember ? (
              <Button onClick={() => navigate(getTenantDashboardPath("/members/add"))}>
                <Plus className="h-4 w-4" />
                Add Member
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-4">
            {filteredAllMembers.map((m) => (
              <MemberCard
                key={m.id}
                person={m}
                onClick={
                  m._pending
                    ? undefined
                    : () => navigate(getTenantDashboardPath(`/members/${m.id}`))
                }
                chips={
                  m._pending ? (
                    <PersonChip
                      icon={Clock}
                      iconOnlyOnMobile
                      className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    >
                      Pending sync
                    </PersonChip>
                  ) : m.hasPendingPayment ? (
                    <PersonChip
                      icon={IndianRupee}
                      iconOnlyOnMobile
                      className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    >
                      Payment pending
                    </PersonChip>
                  ) : null
                }
                subtitle={m.phone}
                actions={renderMemberActions(m)}
                className={cn(m._pending && "border-dashed opacity-70")}
              />
            ))}
          </div>

        </div>
      )}
      </SwipePane>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove member?"
        description="This will remove the member from your gym. This action cannot be undone."
        confirmLabel="Remove"
        onConfirm={handleRemoveConfirmed}
      />
    </div>
  );
}
