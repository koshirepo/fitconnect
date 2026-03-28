import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { tenantsApi } from "@/api/tenants";
import { badgesApi } from "@/api/badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { downloadCsv } from "@/lib/csv";
import { formatDate } from "@/lib/utils";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
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
} from "lucide-react";
import type { TenantMember, Badge } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";
import { usePendingMutations } from "@/lib/use-pending-mutations";
import { Clock } from "lucide-react";

// ─── Status & role config ──────────────────────────────────────────────────────

export default function MembersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId, tenantRole, currentMembership } = useAuthStore();
  const role = tenantRole();
  const gymName = currentMembership()?.tenantName ?? "the gym";
  const isAdmin = role === "ADMIN";

  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);
  const [badges, setBadges] = React.useState<Badge[]>([]);
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

  React.useEffect(() => {
    if (!currentTenantId) return;
    badgesApi
      .list(currentTenantId, 1, 100)
      .then((res) => setBadges(res.data.data))
      .catch(() => {});
  }, [currentTenantId]);

  const fetchMembers = React.useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!currentTenantId) return;
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await tenantsApi.listMembers(
          currentTenantId,
          nextPage,
          20,
          roleFilter || undefined,
          search || undefined,
          statusFilter || undefined,
          badgeFilter || undefined,
        );
        const nextMembers = res.data.data.members;
        setMembers((prev) =>
          mode === "replace" ? nextMembers : appendUniqueById(prev, nextMembers),
        );
        const totalPages = res.data.meta.totalPages;
        setHasMore(nextPage < totalPages);
        setPage(nextPage);
      } catch {
        // silent
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [currentTenantId, roleFilter, statusFilter, search, badgeFilter],
  );

  React.useEffect(() => {
    if (!currentTenantId) return;
    setMembers([]);
    setHasMore(true);
    void fetchMembers(1, "replace");
  }, [currentTenantId, roleFilter, statusFilter, search, badgeFilter, fetchMembers]);

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchMembers(page + 1, "append");
  }, [loading, loadingMore, hasMore, page, fetchMembers]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  // Pending offline members
  const pendingMembers = usePendingMutations("/members");
  const pendingMemberItems: (TenantMember & { _pending: true })[] = pendingMembers.map((m) => ({
    id: `pending-${m.id}`,
    memberId: 0,
    userId: "",
    name: (m.body?.name as string) ?? "New Member",
    email: (m.body?.email as string) ?? "",
    phone: (m.body?.phone as string) ?? null,
    avatarUrl: null,
    role: (m.body?.role as TenantMember["role"]) ?? "MEMBER",
    status: "ACTIVE" as const,
    joinedAt: new Date(m.createdAt).toISOString(),
    _pending: true as const,
  }));

  // Merge and sort latest first
  const allMembers = [...pendingMemberItems, ...members].sort(
    (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
  );

  const handleRemoveConfirmed = async () => {
    if (!currentTenantId || !pendingRemoveId) return;
    try {
      await tenantsApi.removeMember(currentTenantId, pendingRemoveId);
      fetchMembers(1, "replace");
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
          <Button onClick={() => navigate("/members/add")}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {[
          { value: "", label: "All" },
          { value: "ACTIVE", label: "Active" },
          { value: "INACTIVE", label: "Inactive" },
          { value: "DUE", label: "Due" },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => updateParams({ status: tab.value })}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.value === "DUE" && <AlertCircle className="inline h-3.5 w-3.5 mr-1" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => updateParams({ search: e.target.value })}
            className="w-full pl-10 pr-10 py-2 border border-input rounded-md bg-background text-sm"
          />
          {search && (
            <button
              onClick={() => updateParams({ search: "" })}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Role Filter */}
        <Select
          value={roleFilter}
          onChange={(e) => updateParams({ role: e.target.value })}
          className="w-full sm:w-40"
        >
          <option value="">All Roles</option>
          <option value="MEMBER">Members</option>
          {isAdmin && <option value="COACH">Trainers</option>}
        </Select>

        {/* Badge Filter */}
        {badges.length > 0 && (
          <Select
            value={badgeFilter}
            onChange={(e) => updateParams({ badge: e.target.value })}
            className="w-full sm:w-44"
          >
            <option value="">All Badges</option>
            {badges.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : allMembers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members found"
          description="Add members to your gym to get started."
          action={
            <Button onClick={() => navigate("/members/add")}>
              <Plus className="h-4 w-4" />
              Add Member
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="space-y-3">
            {allMembers.map((m) => (
              <Card
                key={m.id}
                className={`hover:shadow-md transition-shadow${(m as any)._pending ? " opacity-70 border-dashed" : ""}`}
              >
                <div className="flex sm:justify-start justify-between sm:items-start p-2 sm:p-4 sm:flex-row flex-col">
                  {/* Member Info */}
                  <div
                    className="flex gap-4 flex-1 min-w-0 cursor-pointer"
                    onClick={() => !(m as any)._pending && navigate(`/members/${m.id}`)}
                  >
                    <AvatarCard
                      name={m.name}
                      avatarUrl={m.avatarUrl}
                      memberId={m.memberId}
                      variant="lg"
                      role={m.role}
                      isActive={m.status === "ACTIVE"}
                    >
                      {m.phone && <p className="text-sm text-muted-foreground">{m.phone}</p>}
                      {(m as any)._pending && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <Clock className="h-3 w-3" />
                          Pending sync
                        </span>
                      )}
                      {/* Due date – mobile */}
                      {m.dueDate && (
                        <p
                          className={`sm:hidden text-xs flex items-center gap-1 mt-0.5 ${m.isDue ? "text-red-600 font-medium" : "text-muted-foreground"}`}
                        >
                          <CalendarClock className="h-3 w-3" />
                          {formatDate(m.dueDate)}
                        </p>
                      )}
                    </AvatarCard>
                  </div>

                  {/* Due date – desktop */}
                  {m.dueDate && (
                    <span
                      className={`hidden sm:flex items-center gap-1 text-xs mr-2 mt-1 ${m.isDue ? "text-red-600 font-medium" : "text-muted-foreground"}`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {formatDate(m.dueDate)}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0 justify-end items-center">
                    {m.isDue && m.phone && (
                      <a
                        href={`https://wa.me/91${m.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${m.name},\n\nThis is a friendly reminder from *${gymName}* that your subscription has expired.\n\nPlease renew your membership at the earliest to continue enjoying uninterrupted access to the gym.\n\nThank you! 🙏`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Send payment reminder via WhatsApp"
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
                        >
                          <AlertTriangle className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/members/${m.id}/edit`)}
                      title="Edit member"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    {m.phone && (
                      <a
                        href={`https://wa.me/91${m.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${m.name}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chat on WhatsApp"
                      >
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {allMembers.length > 0 && (hasMore || loadingMore) && (
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
