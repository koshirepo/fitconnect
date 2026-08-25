import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { tenantsApi } from "@/api/tenants";
import { useAllMembers, useRemoveMember } from "@/api/queries/members";
import { useBadges, useTenantSettings } from "@/api/queries/catalog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoader } from "@/components/ui/spinner";
import { downloadCsv } from "@/lib/csv";
import { formatDate, cn } from "@/lib/utils";
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
  CalendarClock,
  Clock,
  Ban,
  CheckCircle2,
  Shield,
  Dumbbell,
} from "lucide-react";
import type { TenantMember } from "@/types/api";
import { getInitials } from "@fitconnect/shared";
import { usePendingMutations } from "@/lib/use-pending-mutations";
import { getTenantDashboardPath } from "@/lib/subdomain";

type PendingMemberMutationBody = {
  name?: string;
  email?: string;
  phone?: string | null;
  role?: TenantMember["role"];
};

type DisplayMember = TenantMember & { _pending?: boolean };

// ─── Status & role config ──────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: "", label: "All", icon: Users, iconClass: "text-blue-600" },
  { value: "ACTIVE", label: "Active", icon: CheckCircle2, iconClass: "text-emerald-600" },
  { value: "INACTIVE", label: "Inactive", icon: Ban, iconClass: "text-muted-foreground" },
  { value: "DUE", label: "Due", icon: AlertCircle, iconClass: "text-red-600" },
];

/** Small pill above the member name — status, due date, sync state. */
function MemberChip({
  icon: Icon,
  children,
  className,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground sm:gap-1.5 sm:px-2 sm:py-1 sm:text-xs",
        className,
      )}
    >
      <Icon className="size-2.5 sm:size-3.5" />
      {children}
    </span>
  );
}

/** Large square avatar tile with a status-coloured border. */
function MemberAvatar({ member }: { member: DisplayMember }) {
  const accent = member.isDue
    ? "border-red-500"
    : member.status === "ACTIVE"
      ? "border-emerald-500"
      : "border-amber-500";

  const RoleIcon = member.role === "ADMIN" ? Shield : member.role === "COACH" ? Dumbbell : null;

  return (
    <div
      className={cn(
        // Height comes from the card row; aspect-square derives the width from it,
        // so the tile is always a perfect square filling the full card height.
        "relative aspect-square h-full min-w-16 shrink-0 self-stretch overflow-hidden border-r-2 sm:min-w-24",
        accent,
      )}
    >
      {/* Taken out of flow so the photo's intrinsic size can't drive the tile's width */}
      {member.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt={member.name}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-xl font-semibold tracking-wide text-muted-foreground sm:text-3xl">
          {getInitials(member.name)}
        </div>
      )}
      {RoleIcon && (
        <div className="absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full bg-linear-to-br from-slate-700 to-slate-900 shadow-lg sm:size-6">
          <RoleIcon className="h-3 w-3 text-white sm:h-3.5 sm:w-3.5" />
        </div>
      )}
    </div>
  );
}

export default function MembersPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId, currentMembership } = useAuthStore();
  const { can } = usePermissions();
  const gymName = currentMembership()?.tenantName ?? "the gym";
  // Gates the admin-only member operations (status, role, delete, reports).
  const isAdmin = can(Permission.MEMBERS_STATUS_UPDATE);
  const canAddMember = can(Permission.MEMBERS_CREATE);

  const [exporting, setExporting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingRemoveId, setPendingRemoveId] = React.useState<string | null>(null);

  // Read filters from URL
  const roleFilter = searchParams.get("role") ?? "MEMBER";
  const statusFilter = searchParams.get("status") ?? "";
  const badgeFilter = searchParams.get("badge") ?? "";
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
  const loading = membersQuery.isLoading;

  const removeMember = useRemoveMember();

  const paymentReminderTemplateBody = React.useMemo(
    () => getTenantWhatsAppTemplateBody(tenantSettings, "payment_reminder"),
    [tenantSettings],
  );

  const getPaymentReminderUrl = React.useCallback(
    (member: TenantMember) => {
      const text = renderWhatsAppTemplateBody(paymentReminderTemplateBody, {
        memberName: member.name,
        gymName,
        expirySuffix: member.dueDate ? ` on ${formatDate(member.dueDate)}` : "",
      });
      return buildWhatsAppUrl(member.phone, text);
    },
    [paymentReminderTemplateBody, gymName],
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
    avatarUrl: null,
    role: m.body?.role ?? "MEMBER",
    status: "ACTIVE" as const,
    joinedAt: new Date(m.createdAt).toISOString(),
    _pending: true as const,
  }));

  // Merge and sort latest first
  const filteredAllMembers: DisplayMember[] = React.useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();
    const now = new Date();

    return [...pendingMemberItems, ...members]
      .filter((member) => {
        if (roleFilter && member.role !== roleFilter) return false;

        if (statusFilter === "ACTIVE") {
          if (member.status !== "ACTIVE") return false;
        } else if (statusFilter === "INACTIVE") {
          const statusValue = String(member.status).toUpperCase();
          if (statusValue !== "SUSPENDED" && statusValue !== "INACTIVE") return false;
        } else if (statusFilter === "DUE") {
          const due = member.isDue ?? (member.dueDate ? new Date(member.dueDate) <= now : false);
          if (!due || member.status !== "ACTIVE") return false;
        }

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
  }, [badgeFilter, members, pendingMemberItems, roleFilter, search, statusFilter]);

  const renderMemberActions = (m: DisplayMember) => (
    <>
      {!m._pending && m.isDue && m.phone && (
        <a
          href={getPaymentReminderUrl(m) ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          title="Send payment reminder via WhatsApp"
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
    } catch {
      // silent
    } finally {
      setPendingRemoveId(null);
    }
  };

  const handleExportMembers = async () => {
    if (!currentTenantId || !isAdmin) return;

    setExporting(true);
    try {
      let exportPage = 1;
      let totalExportPages = 1;
      const allMembers: TenantMember[] = [];

      do {
        const res = await tenantsApi.listMembers(currentTenantId, exportPage, 100);
        allMembers.push(...res.data.data.members);
        totalExportPages = res.data.meta.totalPages;
        exportPage += 1;
      } while (exportPage <= totalExportPages);

      const rows = allMembers.map((member) => ({
        MemberId: member.id,
        UserId: member.userId,
        Name: member.name,
        Email: member.email,
        Phone: member.phone ?? "",
        Role: member.role,
        JoinedAt: member.joinedAt,
      }));

      downloadCsv(
        `members-${new Date().toISOString().slice(0, 10)}.csv`,
        ["MemberId", "UserId", "Name", "Email", "Phone", "Role", "JoinedAt"],
        rows,
      );
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
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
            <Button variant="outline" onClick={handleExportMembers} disabled={exporting}>
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
        <div className="flex min-w-max gap-6 sm:gap-8">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => updateParams({ status: tab.value })}
                className={cn(
                  "flex items-center gap-2 border-b-2 pt-1 pb-3 text-sm transition-colors",
                  active
                    ? "border-foreground font-semibold text-foreground"
                    : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? tab.iconClass : "text-muted-foreground")} />
                {tab.label}
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

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <Select value={roleFilter} onValueChange={(value) => updateParams({ role: value ?? "" })}>
            <SelectTrigger className="h-12 w-full rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Roles</SelectItem>
              <SelectItem value="MEMBER">Members</SelectItem>
              {isAdmin && <SelectItem value="COACH">Trainers</SelectItem>}
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
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : filteredAllMembers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members found"
          description="Add members to your gym to get started."
          action={
            canAddMember ? (
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
              <Card
                key={m.id}
                className={cn(
                  "rounded-lg py-0 ring-1 ring-border transition-shadow hover:shadow-md",
                  m._pending && "border-dashed opacity-70",
                )}
              >
                <div className="flex min-h-20 items-stretch sm:min-h-32">
                  {/* Member Info */}
                  <div
                    className="flex min-w-0 flex-1 cursor-pointer items-stretch"
                    onClick={() => !m._pending && navigate(getTenantDashboardPath(`/members/${m.id}`))}
                  >
                    <MemberAvatar member={m} />

                    <div className="min-w-0 flex-1 self-center px-3 py-2 sm:px-5 sm:py-4">
                      {/* Status / due chips — kept on one line */}
                      <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden sm:gap-2">
                        {m.status === "ACTIVE" ? (
                          <MemberChip
                            icon={CheckCircle2}
                            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          >
                            Active
                          </MemberChip>
                        ) : (
                          <MemberChip
                            icon={Ban}
                            className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          >
                            Inactive
                          </MemberChip>
                        )}
                        {m.dueDate && (
                          <MemberChip
                            icon={CalendarClock}
                            className={
                              m.isDue ? "bg-red-500/10 text-red-600 dark:text-red-400" : undefined
                            }
                          >
                            <span className="hidden sm:inline">Until </span>
                            {formatDate(m.dueDate)}
                          </MemberChip>
                        )}
                        {m._pending && (
                          <MemberChip
                            icon={Clock}
                            className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          >
                            Pending sync
                          </MemberChip>
                        )}
                      </div>

                      <p className="mt-2 truncate text-base font-bold tracking-tight sm:text-xl">
                        {m.memberId !== undefined && (
                          <span className="font-semibold text-muted-foreground">
                            #{m.memberId} -{" "}
                          </span>
                        )}
                        {m.name}
                      </p>

                      {/* Phone — shares its row with the actions on mobile */}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        {m.phone ? (
                          <p className="truncate text-sm text-muted-foreground sm:text-base">
                            {m.phone}
                          </p>
                        ) : (
                          <span />
                        )}
                        <div
                          className="-mr-1 flex shrink-0 items-center gap-0.5 sm:hidden"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renderMemberActions(m)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions — own column from sm up */}
                  <div className="hidden shrink-0 items-center justify-end gap-2 pr-4 sm:flex">
                    {renderMemberActions(m)}
                  </div>
                </div>
              </Card>
            ))}
          </div>

        </div>
      )}

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
