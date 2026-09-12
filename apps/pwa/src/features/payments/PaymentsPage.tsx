import type { PaymentStatus } from "@/types/api";
import { PageHeader } from "@/components/ui/page-header";
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { Link, useSearchParams } from "react-router-dom";
import {
  MEMBERSHIP_PAYMENT_SOURCES,
  PaymentSource,
} from "@fitconnect/shared/types/enums";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { getApiError } from "@/api/client";
import { useAllPayments, useMyPayments, useUpdatePaymentStatus } from "@/api/queries/payments";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { MemberCard, PersonChip } from "@/components/ui/member-card";
import { PaymentStatusChip } from "@/components/ui/payment-status-chip";
import { SkeletonRow } from "@/components/ui/skeleton";
import { SwipePane } from "@/components/ui/swipe-pane";
import { Spinner } from "@/components/ui/spinner";
import { useWindowedList } from "@/lib/use-windowed-list";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { downloadCsv } from "@/lib/csv";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { dayKey, describeWindow, parseDay, withinDays } from "@/lib/day-window";
import {
  Plus,
  CreditCard,
  CheckCircle2,
  XCircle,
  Download,
  Search,
  X,
  Clock,
  Wallet,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Payment } from "@/types/api";
import { usePendingMutations } from "@/lib/use-pending-mutations";

type PendingPaymentMutationBody = {
  amount?: number;
  validUntil?: string | null;
  note?: string | null;
  _subscriptionTitle?: string;
  _memberName?: string;
  _memberMemberId?: number;
  _memberAvatarUrl?: string | null;
};

type DisplayPayment = Payment & { _pending?: boolean };

/**
 * Filter value for a payment nobody is recorded as having collected.
 *
 * Worth its own option rather than being lumped in with "all": these are the
 * gateway and online payments that arrived without anybody at the desk, and
 * telling them apart from cash somebody took is the point of the filter.
 */
const UNATTRIBUTED = "__none__";

/** Client-side status tabs, mirroring the member list. */
const STATUS_TABS = [
  { value: "", label: "All", icon: Wallet, iconClass: "text-blue-600" },
  { value: "COMPLETED", label: "Completed", icon: CheckCircle2, iconClass: "text-emerald-600" },
  { value: "PENDING", label: "Pending", icon: Clock, iconClass: "text-amber-600" },
  { value: "FAILED", label: "Failed", icon: XCircle, iconClass: "text-red-600" },
  { value: "REFUNDED", label: "Refunded", icon: RotateCcw, iconClass: "text-muted-foreground" },
];

export default function PaymentsPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId, user } = useAuthStore();
  const { can } = usePermissions();
  // Editing, deleting, and exporting payments are the admin-level grants.
  const isAdmin = can(Permission.PAYMENTS_UPDATE);
  // Approving or rejecting what is still owed is desk work, so a coach gets
  // those two buttons without the rest of the admin toolkit.
  const canSettle = isAdmin || can(Permission.PAYMENTS_SETTLE);
  const canViewAllPayments = can(Permission.PAYMENTS_READ);
  const canRecordPayment = can(Permission.PAYMENTS_CREATE);

  const toast = useToast();

  const [confirmAction, setConfirmAction] = React.useState<{
    paymentId: string;
    status: "COMPLETED" | "FAILED";
    amount: number;
  } | null>(null);

  // The collector select and the date boxes live behind this on phones.
  const [filterSheetOpen, setFilterSheetOpen] = React.useState(false);

  const statusFilter = searchParams.get("status") ?? "";
  const searchTerm = searchParams.get("search") ?? "";
  const collectedByFilter = searchParams.get("collectedBy") ?? "";
  // A half-open day window on when the payment was recorded. An admin sets one
  // with the date boxes below; it also arrives on the URL from a figure on the
  // analytics screen, which is how a period there points at the rows it was
  // adding up. `to` is exclusive either way.
  const recordedFrom = searchParams.get("from") ?? "";
  const recordedTo = searchParams.get("to") ?? "";
  const hasWindow = Boolean(recordedFrom || recordedTo);

  // The boxes speak in the days a person picked, so the exclusive `to` reads
  // back a day: otherwise choosing 30 Sep would show as 1 Oct in the box.
  const recordedToInclusive = React.useMemo(() => {
    const end = parseDay(recordedTo);
    return end ? dayKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1)) : "";
  }, [recordedTo]);

  // A payment is only recorded when it happens, so a day past today can match
  // nothing and the pickers refuse it. `from` stops at `to` as well, so the two
  // cannot cross into a window that is empty by construction.
  const todayKey = dayKey(new Date());
  const recordedFromMax =
    recordedToInclusive && recordedToInclusive < todayKey ? recordedToInclusive : todayKey;

  // Local box, URL 300ms behind it. Every keystroke used to re-filter the whole
  // ledger and push a history entry, so backspacing walked back through the
  // typing rather than clearing the field.
  const [searchInput, setSearchInput] = React.useState(searchTerm);
  const searchTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  // Swiping walks the same tab strip the taps use.
  const statusTabIndex = Math.max(
    STATUS_TABS.findIndex((tab) => tab.value === statusFilter),
    0,
  );

  const setStatusFilter = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("status", value);
      else next.delete("status");
      next.delete("page");
      return next;
    });
  };

  /**
   * Set the recorded window from the two date boxes.
   *
   * The boxes hold inclusive days but the URL keeps `to` exclusive, so the day
   * picked as the end is written as the day after it — which is what makes the
   * picked day itself land in the list.
   */
  const setWindowEnd = (from: string, toInclusive: string) => {
    const end = parseDay(toInclusive);
    const exclusiveTo = end
      ? dayKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1))
      : "";
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (from) next.set("from", from);
      else next.delete("from");
      if (exclusiveTo) next.set("to", exclusiveTo);
      else next.delete("to");
      next.delete("page");
      return next;
    });
  };

  /** Drop the dates, keep the tab and the search. */
  const clearWindow = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("from");
      next.delete("to");
      next.delete("page");
      return next;
    });
  };

  const setCollectedByFilter = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("collectedBy", value);
      else next.delete("collectedBy");
      next.delete("page");
      return next;
    });
  };

  const goToTab = (offset: number) => {
    const next = STATUS_TABS[statusTabIndex + offset];
    if (next) setStatusFilter(next.value);
  };

  const setSearchTerm = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("search", value);
      else next.delete("search");
      next.delete("page");
      return next;
    });
  };

  /** Type into the box now, filter 300ms after the typing stops. */
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => setSearchTerm(value), 300);
  };

  const clearSearch = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    setSearchTerm("");
  };

  // The whole ledger is fetched once and filtered in the browser, the way the
  // member list works: one cached result serves every tab, so switching tabs
  // and typing in the search box cost nothing.
  /**
   * Which of the gym's two businesses this screen is reading.
   *
   * Memberships by default. A gym that sells more tubs than it signs members
   * used to open this page onto a wall of store sales with a renewal buried
   * somewhere in it — the shop is a real ledger, but it is not this one, and it
   * has its own page with cost and margin on it.
   *
   * Two separate fetches rather than one filtered in the browser: the hook keys
   * its cache by scope, so switching is instant on the way back and the common
   * case never pays to download a business it will not show.
   */
  const ledger = searchParams.get("ledger") === "store" ? "store" : "memberships";
  const sources =
    ledger === "store" ? [PaymentSource.STORE] : MEMBERSHIP_PAYMENT_SOURCES;

  const allPaymentsQuery = useAllPayments({ enabled: canViewAllPayments, sources });
  const myPaymentsQuery = useMyPayments({ enabled: !canViewAllPayments });

  const payments = React.useMemo<Payment[]>(
    () => (canViewAllPayments ? (allPaymentsQuery.data ?? []) : (myPaymentsQuery.data ?? [])),
    [canViewAllPayments, allPaymentsQuery.data, myPaymentsQuery.data],
  );

  // `isPending`, not `isLoading`: both queries are gated on the tenant id, and a
  // disabled query reports `isLoading: false` with no data — so this screen
  // painted "No payments found" before the first fetch had even started, which
  // is what a phone resolving its subdomain slowly showed every time. Guarded
  // by the tenant id, because a query that never runs stays pending forever.
  const activeQuery = canViewAllPayments ? allPaymentsQuery : myPaymentsQuery;
  const loading =
    Boolean(currentTenantId) &&
    (activeQuery.isPending || (activeQuery.isFetching && payments.length === 0));

  // A warm cache paints instantly and then refetches in the background. Without
  // this the screen looks idle while it is anything but.
  const refreshing = !loading && activeQuery.isFetching;

  const updatePaymentStatus = useUpdatePaymentStatus();

  // Pending offline payments
  const pendingPayments = usePendingMutations<PendingPaymentMutationBody>("/payments");
  const pendingPaymentItems: DisplayPayment[] = React.useMemo(
    () =>
      pendingPayments.map((p) => ({
        id: `pending-${p.id}`,
        amount: p.body?.amount ?? 0,
        status: "PENDING" as const,
        paidAt: null,
        validFrom: null,
        validUntil: p.body?.validUntil ?? null,
        description: p.body?._subscriptionTitle ?? p.body?.note ?? null,
        note: p.body?.note ?? null,
        createdAt: new Date(p.createdAt).toISOString(),
        member: p.body?._memberName
          ? {
              id: "pending",
              memberId: p.body._memberMemberId ?? 0,
              userId: "",
              name: p.body._memberName,
              email: "",
              avatarUrl: p.body._memberAvatarUrl ?? null,
            }
          : undefined,
        subscription: p.body?._subscriptionTitle
          ? { id: "pending", title: p.body._subscriptionTitle }
          : undefined,
        _pending: true as const,
      })),
    [pendingPayments],
  );

  // Merge offline-queued rows in, apply the search, and sort latest first — all
  const collectors = React.useMemo(() => {
    const byId = new Map<string, string>();
    for (const payment of payments) {
      if (payment.collectedBy) byId.set(payment.collectedBy.id, payment.collectedBy.name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [payments]);

  // in the browser, over the full ledger. The status tabs filter this list
  // rather than the raw one, so the tab counts always match what a click shows.
  const searchedPayments: DisplayPayment[] = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const rows: DisplayPayment[] = [...pendingPaymentItems, ...payments];

    return rows
      .filter((p) => {
        // A payment queued offline has no collector on its placeholder row and
        // is exempt, so it does not disappear mid-sync.
        if (collectedByFilter && !p._pending) {
          const collectorId = p.collectedBy?.id ?? UNATTRIBUTED;
          if (collectorId !== collectedByFilter) return false;
        }

        // Recorded, not paid: the analytics screen buckets a payment by when
        // the row was created, and a window that read a different date would
        // list a different set of rows than the total that was clicked.
        if (hasWindow && !withinDays(p.createdAt, recordedFrom, recordedTo)) return false;

        if (!term) return true;

        const haystack = [
          p.member?.name,
          p.member?.email,
          p.member?.memberId,
          p.subscription?.title,
          p.description,
          p.note,
          p.amount,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(term);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [
    collectedByFilter,
    hasWindow,
    pendingPaymentItems,
    payments,
    recordedFrom,
    recordedTo,
    searchTerm,
  ]);

  const allPayments: DisplayPayment[] = React.useMemo(
    () =>
      statusFilter ? searchedPayments.filter((p) => p.status === statusFilter) : searchedPayments,
    [searchedPayments, statusFilter],
  );

  // The ledger stays whole in memory so the tabs, the search, and offline reads
  // stay instant; only a page of it reaches the DOM. Payments are the list that
  // grows without bound, so this is the one that needed it most.
  const {
    visibleItems: visiblePayments,
    sentinelRef,
    hasMore,
    loadMore,
    shown,
    total,
  } = useWindowedList(allPayments, {
    pageSize: 25,
    resetKey: `${statusFilter}|${searchTerm}|${collectedByFilter}|${recordedFrom}|${recordedTo}`,
  });

  /** Row count behind each tab, so a tab shows what clicking it will reveal. */
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { "": searchedPayments.length };
    for (const p of searchedPayments) {
      counts[p.status] = (counts[p.status] ?? 0) + 1;
    }
    return counts;
  }, [searchedPayments]);

  // Whether the sheet has anything in it — the collector list is empty until a
  // payment names one, so a coach can be left with no filters at all, and the
  // button should not open an empty sheet when they are.
  const hasFilterControls = collectors.length > 0 || isAdmin;

  // What the Filters button counts: only what the sheet can express, the
  // collector and the recorded dates. The tab strip and the search box are on
  // screen already, so a badge for either would point at nothing hidden.
  const activeFilterCount =
    (collectors.length > 0 && collectedByFilter ? 1 : 0) + (isAdmin && hasWindow ? 1 : 0);

  const hasActiveFilters = Boolean(statusFilter || searchTerm || collectedByFilter || hasWindow);

  /** The whole ledger back: the tab, the search box, and the sheet. */
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of ["status", "search", "collectedBy", "from", "to", "page"]) {
        next.delete(key);
      }
      return next;
    });
  };

  const handleStatusUpdate = async (paymentId: string, status: PaymentStatus) => {
    try {
      await updatePaymentStatus.mutateAsync({ paymentId, status });
      toast.success(status === "COMPLETED" ? "Payment approved." : "Payment marked failed.");
    } catch (caught) {
      // This used to be swallowed, so an approval that failed looked exactly
      // like one that worked.
      toast.error({
        message: "Could not update the payment.",
        description: getApiError(caught),
      });
    }
  };

  /**
   * Export exactly the rows on screen.
   *
   * The ledger is already filtered and already in memory, so the file always
   * matches what the person looking at it can see. This used to re-fetch the
   * whole ledger a page at a time into a local array that shadowed the filtered
   * one, which meant every download ignored the status tab, the search box and
   * the collector filter and handed back the entire ledger regardless.
   */
  const handleExportPayments = () => {
    if (!isAdmin) return;

    const rows = allPayments
      // Offline rows have no server id yet; exporting a placeholder would put a
      // payment in the file that does not exist anywhere else.
      .filter((payment) => !payment._pending)
      .map((payment) => ({
        PaymentId: payment.id,
        MemberName: payment.member?.name ?? "",
        MemberEmail: payment.member?.email ?? "",
        Subscription: payment.subscription?.title ?? payment.description ?? "",
        Amount: payment.amount,
        Status: payment.status,
        CollectedBy: payment.collectedBy?.name ?? "",
        CreatedAt: payment.createdAt,
        PaidAt: payment.paidAt ?? "",
        ValidFrom: payment.validFrom ?? "",
        ValidUntil: payment.validUntil ?? "",
      }));

    if (rows.length === 0) return;

    // Name the file after the filters, so two exports taken minutes apart are
    // still tellable apart in a downloads folder.
    const parts = [
      "payments",
      statusFilter ? statusFilter.toLowerCase() : "",
      collectedByFilter === UNATTRIBUTED
        ? "unattributed"
        : collectedByFilter
          ? collectors.find((collector) => collector.id === collectedByFilter)?.name
          : "",
      searchTerm.trim() ? "search" : "",
      new Date().toISOString().slice(0, 10),
    ].filter(Boolean);

    downloadCsv(
      `${parts.join("-").replace(/\s+/g, "-").toLowerCase()}.csv`,
      [
        "PaymentId",
        "MemberName",
        "MemberEmail",
        "Subscription",
        "Amount",
        "Status",
        "CollectedBy",
        "CreatedAt",
        "PaidAt",
        "ValidFrom",
        "ValidUntil",
      ],
      rows,
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Payments"
        description={canViewAllPayments ? "Track all tenant payments" : "Your payment history"}
        actions={
          <>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button variant="outline" onClick={handleExportPayments}>
                  <Download className="h-4 w-4" />
                </Button>
              )}
              {canRecordPayment && (
                <Button onClick={() => navigate("/payments/record")}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        }
      />

      {/* Filters - admin and coaches */}
      {canViewAllPayments && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, email, admission no, plan, or amount..."
                value={searchInput}
                onChange={(e) => onSearchChange(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background pr-10 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
              />
              {searchInput && (
                <button
                  onClick={clearSearch}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Phones only: the collector and the dates live behind this. */}
            {hasFilterControls && (
              <Button
                variant="outline"
                className="relative h-10 w-10 shrink-0 rounded-md p-0 sm:hidden"
                onClick={() => setFilterSheetOpen(true)}
                aria-label={
                  activeFilterCount > 0 ? `Filters (${activeFilterCount} applied)` : "Filters"
                }
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            )}
          </div>

          {/*
            One definition of each control, rendered by both layouts below.
            Writing the collector and the dates out twice — once inline, once in
            the sheet — is how the two quietly stop agreeing about what a filter
            does.
          */}
          {(() => {
            const fields = [
              ...(collectors.length > 0
                ? [
                    {
                      id: "collectedBy",
                      label: "Collected by",
                      control: (
                        <Select
                          value={collectedByFilter}
                          onValueChange={(value) => setCollectedByFilter(value ?? "")}
                        >
                          <SelectTrigger className="h-10 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Collected by anyone</SelectItem>
                            {collectors.map((collector) => (
                              <SelectItem key={collector.id} value={collector.id}>
                                {collector.name}
                              </SelectItem>
                            ))}
                            <SelectItem value={UNATTRIBUTED}>Not recorded</SelectItem>
                          </SelectContent>
                        </Select>
                      ),
                    },
                  ]
                : []),
              // Reading the ledger over a period is the admin grant that also
              // opens export, where a coach only needs the latest rows. The
              // window itself is not admin-only: analytics deep-links one in for
              // anyone, and the chip below says so.
              ...(isAdmin
                ? [
                    {
                      id: "recorded",
                      label: "Recorded dates",
                      control: (
                        <div className="flex items-center gap-2">
                          {/* On phones the sheet's own label heads this, so the
                              prefix would only say it twice. */}
                          <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">
                            Recorded
                          </span>
                          <input
                            type="date"
                            aria-label="Recorded from"
                            value={recordedFrom}
                            max={recordedFromMax}
                            onChange={(e) => setWindowEnd(e.target.value, recordedToInclusive)}
                            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          />
                          <span className="shrink-0 text-xs text-muted-foreground">to</span>
                          <input
                            type="date"
                            aria-label="Recorded to"
                            value={recordedToInclusive}
                            min={recordedFrom || undefined}
                            max={todayKey}
                            onChange={(e) => setWindowEnd(recordedFrom, e.target.value)}
                            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          />
                        </div>
                      ),
                    },
                  ]
                : []),
            ];

            if (fields.length === 0) return null;

            return (
              <>
                {/* Wider screens keep them inline, one column each. */}
                <div
                  className="hidden w-full gap-3 sm:grid"
                  style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(0, 1fr))` }}
                >
                  {fields.map((field) => (
                    <React.Fragment key={field.id}>{field.control}</React.Fragment>
                  ))}
                </div>

                <Dialog open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Filters</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {fields.map((field) => (
                        <div key={field.id} className="space-y-2">
                          <Label>{field.label}</Label>
                          {field.control}
                        </div>
                      ))}
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            clearFilters();
                            setFilterSheetOpen(false);
                          }}
                          disabled={!hasActiveFilters}
                        >
                          Clear all
                        </Button>
                        <Button onClick={() => setFilterSheetOpen(false)}>Done</Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            );
          })()}
        </div>
      )}

      {/* A window is on the URL — typed into the boxes above, or arriving from a
          total on the analytics screen. Without a line saying so the ledger
          would just look short. */}
      {hasWindow && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium">
            {describeWindow("Recorded", recordedFrom, recordedTo)}
          </span>
          <button
            type="button"
            onClick={clearWindow}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear dates
          </button>
        </div>
      )}

      {/* Which business this ledger is showing. Memberships and the shop are
          separate reads, so this is a switch rather than another status tab. */}
      {canViewAllPayments && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                { value: "memberships", label: "Memberships" },
                { value: "store", label: "Store sales" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  if (option.value === "store") next.set("ledger", "store");
                  else next.delete("ledger");
                  setSearchParams(next);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  ledger === option.value
                    ? "bg-muted font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {ledger === "store" && (
            <Link
              to="/dashboard/store/analytics"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              See what the shop earned →
            </Link>
          )}
        </div>
      )}

      {/* Status Filter Tabs */}
      {canViewAllPayments && (
        <div className="overflow-x-auto overflow-y-hidden border-b border-border [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-6 sm:gap-8">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.value;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => {
                    setStatusFilter(tab.value);
                  }}
                  className={cn(
                    "flex items-center gap-2 border-b-2 pt-1 pb-3 text-sm transition-colors",
                    active
                      ? "border-foreground font-semibold text-foreground"
                      : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4", active ? tab.iconClass : "text-muted-foreground")}
                  />
                  {tab.label}
                  <span className="text-xs text-muted-foreground">
                    ({statusCounts[tab.value] ?? 0})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {refreshing && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* The live region is this line, not the icon: the spinner carries a
              "Loading" label of its own that would be announced twice. */}
          <Spinner aria-hidden className="size-3" />
          Refreshing payments…
        </p>
      )}

      <SwipePane
        paneKey={statusFilter}
        paneIndex={statusTabIndex}
        enabled={canViewAllPayments}
        onNext={() => goToTab(1)}
        onPrevious={() => goToTab(-1)}
      >
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg ring-1 ring-foreground/10">
                <SkeletonRow className="p-3" />
              </div>
            ))}
          </div>
        ) : allPayments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No payments found"
            description={
              hasActiveFilters
                ? "No payments match this filter."
                : canViewAllPayments
                  ? "Record the first payment."
                  : "No payment history yet."
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              {visiblePayments.map((p) => (
                <MemberCard
                  key={p.id}
                  size="md"
                  // A member viewing their own history has no other person to
                  // name, so the plan title stands in as the identity line.
                  person={
                    canViewAllPayments && p.member
                      ? p.member
                      : { name: p.subscription?.title ?? p.description ?? "Payment" }
                  }
                  onClick={p._pending ? undefined : () => navigate(`/payments/${p.id}`)}
                  // This page is about the payment, not the membership, so the
                  // payment's status takes the chip slot the member list gives to
                  // Active/Until. The tile's coloured edge still reads membership.
                  showStatusChips={false}
                  chips={
                    <>
                      <PaymentStatusChip status={p.status} />
                      {p._pending && (
                        <PersonChip
                          icon={Clock}
                          className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        >
                          Pending sync
                        </PersonChip>
                      )}
                    </>
                  }
                  subtitle={
                    <>
                      {/* The plan already names a self-view row, so it only
                        repeats itself here; staff rows lead with it. */}
                      {canViewAllPayments && p.member && (
                        <>
                          {p.subscription?.title ?? p.description ?? "—"}
                          {p.collectedBy && (
                            <span className="font-medium text-foreground/70">
                              {" · "}
                              {p.collectedBy.userId === user?.id ? "You" : p.collectedBy.name}
                            </span>
                          )}
                          {" · "}
                        </>
                      )}
                      <span className="text-muted-foreground">
                        {formatDate(p.validUntil ?? p.createdAt)}
                      </span>
                    </>
                  }
                  actions={
                    <>
                      <p className="text-base font-semibold sm:text-lg">
                        {formatCurrency(p.amount)}
                      </p>
                      {canSettle && !p._pending && p.status === "PENDING" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmAction({
                                paymentId: p.id,
                                status: "COMPLETED",
                                amount: p.amount,
                              });
                            }}
                            title="Approve payment"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmAction({
                                paymentId: p.id,
                                status: "FAILED",
                                amount: p.amount,
                              });
                            }}
                            title="Reject payment"
                          >
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </>
                  }
                  className={cn(p._pending && "border-dashed opacity-70")}
                />
              ))}
            </div>

            {hasMore ? (
              <div ref={sentinelRef} className="flex justify-center pt-2">
                {/* The observer normally reveals the next screenful before this is
                  reached. The button is what saves a reader whose browser has no
                  IntersectionObserver, or whose list sits in a container that
                  never triggers one. */}
                <Button variant="ghost" size="sm" onClick={loadMore}>
                  Load more
                </Button>
              </div>
            ) : (
              shown > 0 && (
                <p className="pt-2 text-center text-xs text-muted-foreground">
                  Showing all {total} payments
                </p>
              )
            )}
          </div>
        )}
      </SwipePane>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction?.status === "COMPLETED" ? "Approve payment?" : "Reject payment?"}
        description={
          confirmAction?.status === "COMPLETED"
            ? `Mark payment of ${formatCurrency(confirmAction.amount)} as completed?`
            : `Mark payment of ${formatCurrency(confirmAction?.amount ?? 0)} as failed? This cannot be undone.`
        }
        confirmLabel={confirmAction?.status === "COMPLETED" ? "Approve" : "Reject"}
        onConfirm={() => {
          if (confirmAction) {
            handleStatusUpdate(confirmAction.paymentId, confirmAction.status);
          }
        }}
      />
    </div>
  );
}
