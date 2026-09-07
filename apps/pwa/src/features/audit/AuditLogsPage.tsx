/**
 * Documentation: The trail of who changed what.
 *
 * - A dated feed rather than a table. An audit log is read chronologically — "what happened to this gym yesterday" — and a seven-column table answered that only on a desktop, scrolling sideways on the phone this app is mostly used on.
 * - Each entry is a sentence: actor, verb, thing. The stored row is `UPDATE`/`Payment`/`clx…`, which is not what a person asking who cancelled a membership needs to read.
 * - Filters live in the URL, so a filtered view survives a refresh and can be sent to somebody. They were component state before, and a link to "every deletion this week" could not be shared.
 * - Metadata is rendered as fields, with the raw JSON kept behind a toggle for the rows whose payload is nested.
 * - Primary exports: AuditLogsPage.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { useAuditLogsInfinite } from "@/api/queries/platform";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { downloadCsv } from "@/lib/csv";
import { cn, formatDateTime } from "@/lib/utils";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { AuditAction } from "@fitconnect/shared/types/enums";
import type { AuditLog } from "@/types/api";
import {
  Building2,
  ChevronDown,
  Download,
  FileText,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Search,
  Settings,
  Shield,
  Trash2,
  X,
} from "lucide-react";

/**
 * The actions this app actually writes.
 *
 * Taken from the shared enum rather than listed by hand: the previous list was
 * written from imagination and offered eleven values — ADD_MEMBER,
 * CREATE_PAYMENT, ASSIGN_WORKOUT_PLAN and the rest — that nothing has ever
 * stored, so choosing one silently emptied the table.
 */
const AUDIT_ACTIONS = Object.values(AuditAction);

/**
 * How each action reads and looks.
 *
 * `verb` is the past tense used in the sentence — "Rahul deleted Payment" — so
 * the row reads as prose rather than as a constant. The colour is keyed off the
 * exact stored value; the previous substring test (`action.includes("CREATE")`)
 * was left over from the imaginary action list above, and among the seven
 * values actually written it only ever matched by accident.
 */
const ACTION_META: Record<
  string,
  { label: string; verb: string; icon: React.ElementType; tile: string }
> = {
  CREATE: {
    label: "Created",
    verb: "created",
    icon: Plus,
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  UPDATE: {
    label: "Updated",
    verb: "updated",
    icon: Pencil,
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  DELETE: {
    label: "Deleted",
    verb: "deleted",
    icon: Trash2,
    tile: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  LOGIN: {
    label: "Signed in",
    verb: "signed in",
    icon: LogIn,
    tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  LOGOUT: {
    label: "Signed out",
    verb: "signed out",
    icon: LogOut,
    tile: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  },
  ROLE_CHANGE: {
    label: "Role changed",
    verb: "changed the role on",
    icon: Shield,
    tile: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  SETTINGS_CHANGE: {
    label: "Settings changed",
    verb: "changed settings on",
    icon: Settings,
    tile: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
};

const FALLBACK_META = {
  label: "Changed",
  verb: "changed",
  icon: FileText,
  tile: "bg-muted text-muted-foreground",
} as const;

const metaFor = (action: string) => ACTION_META[action] ?? FALLBACK_META;

/**
 * `TenantMembership` → `Tenant membership`.
 *
 * Entity names are stored as the Prisma model name, which is the right thing to
 * store and the wrong thing to show somebody.
 */
function humanizeEntity(entity: string) {
  const spaced = entity.replace(/([a-z0-9])([A-Z])/gu, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Field names out of a metadata payload, on the same rule. */
function humanizeKey(key: string) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").replace(/[_-]+/gu, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The day heading a row falls under.
 *
 * Compared on the local date rather than on a UTC slice of the ISO string: east
 * of Greenwich those disagree for everything logged after early evening, which
 * would file this evening's entries under tomorrow.
 */
function dayKey(value: string | Date) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function dayLabel(key: string) {
  if (key === dayKey(new Date())) return "Today";

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday)) return "Yesterday";

  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "2h ago" — the day heading already carries the date, so this is the time. */
function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** A metadata value on one line, or `null` when it needs the raw block instead. */
function scalarText(value: unknown): string | null {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString("en-IN");
  if (typeof value === "string") return value === "" ? "—" : value;
  return null;
}

interface Props {
  scope?: "platform" | "tenant";
}

export default function AuditLogsPage({ scope = "tenant" }: Props) {
  const { isPlatformStaff } = useAuthStore();
  const effectiveScope = scope === "platform" && isPlatformStaff() ? "platform" : "tenant";

  // Filters live in the URL so a filtered feed can be linked and survives a
  // refresh — the same rule the members and payments lists follow.
  const [searchParams, setSearchParams] = useSearchParams();
  const actionFilter = searchParams.get("action") ?? "";
  const entityFilter = searchParams.get("entity") ?? "";
  const searchTerm = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = React.useState(searchTerm);
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);
  const [showRaw, setShowRaw] = React.useState<string | null>(null);

  const updateParams = React.useCallback(
    (next: Record<string, string>) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          for (const [key, value] of Object.entries(next)) {
            if (value) params.set(key, value);
            else params.delete(key);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // The box updates on every keystroke; the URL follows a beat later, so typing
  // neither pushes a history entry per character nor refires the query.
  React.useEffect(() => {
    const id = window.setTimeout(() => updateParams({ q: searchInput.trim() }), 300);
    return () => window.clearTimeout(id);
  }, [searchInput, updateParams]);

  const logsQuery = useAuditLogsInfinite(effectiveScope, {
    action: actionFilter || undefined,
    entity: entityFilter || undefined,
  });

  const logs = React.useMemo(() => flattenPages<AuditLog>(logsQuery.data?.pages), [logsQuery.data]);
  const loading = logsQuery.isPending;
  const loadingMore = logsQuery.isFetchingNextPage;
  const hasMore = Boolean(logsQuery.hasNextPage);
  const error = logsQuery.isError ? getApiError(logsQuery.error) : "";

  /**
   * The entity dropdown offers what has actually been logged.
   *
   * There are thirty-odd entity names in the codebase and no endpoint that
   * lists them, so a hand-written list would go stale the first time a module
   * started auditing something new. Built from the loaded pages instead, which
   * means it grows as the feed is scrolled — honest about what it knows.
   */
  const entityOptions = React.useMemo(() => {
    const seen = new Set(logs.map((log) => log.entity));
    if (entityFilter) seen.add(entityFilter);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [logs, entityFilter]);

  /**
   * Search narrows the rows already loaded rather than querying the server.
   *
   * Neither audit endpoint takes a search term, so this filters what is on
   * screen instead of pretending to search the whole trail. The empty state
   * says so, so nobody reads no matches as "it never happened".
   */
  const visibleLogs = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter((log) =>
      [log.actor?.name, log.actor?.email, log.entity, log.entityId, log.ipAddress]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term)),
    );
  }, [logs, searchTerm]);

  /** Rows bucketed under their day, in the order the API returned them. */
  const days = React.useMemo(() => {
    const groups: { key: string; logs: AuditLog[] }[] = [];
    for (const log of visibleLogs) {
      const key = dayKey(log.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.logs.push(log);
      else groups.push({ key, logs: [log] });
    }
    return groups;
  }, [visibleLogs]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (logsQuery.hasNextPage && !logsQuery.isFetchingNextPage) {
        void logsQuery.fetchNextPage();
      }
    },
  });

  const activeFilterCount = [actionFilter, entityFilter, searchTerm].filter(Boolean).length;

  const resetFilters = () => {
    setSearchInput("");
    updateParams({ action: "", entity: "", q: "" });
  };

  /**
   * The rows on screen, as a file.
   *
   * What is loaded, not the whole trail — the same rule the search box follows,
   * and the reason the button names the count.
   */
  const handleExport = () => {
    if (visibleLogs.length === 0) return;

    const rows = visibleLogs.map((log) => ({
      When: log.createdAt,
      Who: log.actor?.name ?? (log.actorId ? "Unknown user" : "System"),
      Email: log.actor?.email ?? "",
      Action: metaFor(log.action).label,
      Entity: log.entity,
      EntityId: log.entityId ?? "",
      Tenant: log.tenantId ?? "",
      IP: log.ipAddress ?? "",
      Details: log.metadata ? JSON.stringify(log.metadata) : "",
    }));

    // Name the file after the filters, so two exports taken minutes apart are
    // still tellable apart in a downloads folder.
    const parts = [
      effectiveScope === "platform" ? "platform-audit" : "audit",
      actionFilter ? actionFilter.toLowerCase() : "",
      entityFilter ? entityFilter.toLowerCase() : "",
      searchTerm.trim() ? "search" : "",
      new Date().toISOString().slice(0, 10),
    ].filter(Boolean);

    downloadCsv(
      `${parts.join("-").replace(/\s+/gu, "-").toLowerCase()}.csv`,
      ["When", "Who", "Email", "Action", "Entity", "EntityId", "Tenant", "IP", "Details"],
      rows,
    );
  };

  if (loading) {
    return <ListPageSkeleton search filters={2} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">
            {effectiveScope === "platform" ? "Platform audit" : "Audit log"}
          </h1>
          <p className="text-sm text-muted-foreground">Who changed what, newest first.</p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={handleExport}
          disabled={visibleLogs.length === 0}
          aria-label={`Download these ${visibleLogs.length} entries as CSV`}
          title={`Download these ${visibleLogs.length} entries as CSV`}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters. One row on a desktop, stacked on a phone — and no card around
          them, which is chrome this page does not need. */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search loaded entries by person, thing, or IP..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-12 w-full rounded-lg border border-input bg-background pr-10 pl-12 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select
            value={actionFilter}
            onValueChange={(value) => updateParams({ action: value ?? "" })}
          >
            <SelectTrigger className="h-10 w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Any action</SelectItem>
              {AUDIT_ACTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {metaFor(action).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={entityFilter}
            onValueChange={(value) => updateParams({ entity: value ?? "" })}
          >
            <SelectTrigger className="h-10 w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Anything</SelectItem>
              {entityOptions.map((entity) => (
                <SelectItem key={entity} value={entity}>
                  {humanizeEntity(entity)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="sm:ml-1" onClick={resetFilters}>
              Clear {activeFilterCount === 1 ? "filter" : "filters"}
            </Button>
          )}
        </div>
      </div>

      {/* An error replaces the feed, not the page: losing the filter bar with it
          meant the only way out of a failed request was a reload. */}
      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && visibleLogs.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileText}
              title={activeFilterCount > 0 ? "Nothing matches" : "Nothing logged yet"}
              description={
                activeFilterCount > 0
                  ? "No entry on screen matches these filters. The search box only looks at what has loaded — scroll for more, or clear the filters."
                  : "Actions taken in this gym will appear here as they happen."
              }
              action={
                activeFilterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <div key={day.key} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {dayLabel(day.key)}
                </h2>
                <span className="text-[11px] tabular-nums text-muted-foreground/70">
                  {day.logs.length}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border/60">
                    {day.logs.map((log) => {
                      const meta = metaFor(log.action);
                      const Icon = meta.icon;
                      const expanded = expandedRow === log.id;
                      // A raw actor id says nothing to a person reading the
                      // log, so an unnamed actor reads as the system rather
                      // than as a cuid.
                      const actor = log.actor?.name ?? (log.actorId ? "Unknown user" : "System");
                      const entries = log.metadata ? Object.entries(log.metadata) : [];

                      return (
                        <li key={log.id}>
                          <button
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => {
                              setExpandedRow(expanded ? null : log.id);
                              setShowRaw(null);
                            }}
                            className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 sm:px-4 sm:py-3"
                          >
                            <span
                              className={cn(
                                "grid size-8 shrink-0 place-items-center rounded-lg sm:size-9",
                                meta.tile,
                              )}
                              title={meta.label}
                            >
                              <Icon className="size-4" />
                            </span>

                            <span className="min-w-0 flex-1">
                              {/* The sentence. The stored row is
                                  UPDATE / Payment / clx…, which is not what
                                  somebody asking who cancelled a membership
                                  needs to read. */}
                              <span className="block truncate text-sm">
                                <span className="font-semibold">{actor}</span>{" "}
                                <span className="text-muted-foreground">{meta.verb}</span>{" "}
                                <span className="font-medium">{humanizeEntity(log.entity)}</span>
                                {log.entityId && (
                                  <span
                                    className="ml-1.5 font-mono text-[11px] text-muted-foreground"
                                    title={log.entityId}
                                  >
                                    #{log.entityId.slice(-6)}
                                  </span>
                                )}
                              </span>

                              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                                <span title={formatDateTime(log.createdAt)}>
                                  {timeAgo(log.createdAt)}
                                </span>
                                {log.actor?.email && (
                                  <span className="truncate">· {log.actor.email}</span>
                                )}
                                {/* The tenant feed carries no IP or tenant id,
                                    so these only appear where there is
                                    something to put in them. */}
                                {effectiveScope === "platform" && log.ipAddress && (
                                  <span className="font-mono">· {log.ipAddress}</span>
                                )}
                                {effectiveScope === "platform" && log.tenantId && (
                                  <span
                                    className="inline-flex items-center gap-1"
                                    title={log.tenantId}
                                  >
                                    · <Building2 className="size-3" />
                                    <span className="font-mono">{log.tenantId.slice(-6)}</span>
                                  </span>
                                )}
                              </span>
                            </span>

                            <ChevronDown
                              className={cn(
                                "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                                expanded && "rotate-180",
                              )}
                            />
                          </button>

                          {expanded && (
                            <div className="border-t border-border/60 bg-muted/40 px-3 py-3 sm:px-4">
                              {entries.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  No further details were recorded for this entry.
                                </p>
                              ) : showRaw === log.id ? (
                                <pre className="max-h-64 overflow-auto font-mono text-[11px] whitespace-pre-wrap">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              ) : (
                                <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                                  {entries.map(([key, value]) => {
                                    const text = scalarText(value);
                                    return (
                                      <div
                                        key={key}
                                        className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5"
                                      >
                                        <dt className="shrink-0 text-[11px] text-muted-foreground">
                                          {humanizeKey(key)}
                                        </dt>
                                        <dd className="min-w-0 text-right text-xs font-medium break-words">
                                          {/* A nested value has no one-line
                                              form, so it says what it is and
                                              the raw toggle shows it in full. */}
                                          {text ?? (
                                            <span className="font-mono text-muted-foreground">
                                              {Array.isArray(value)
                                                ? `${value.length} items`
                                                : "see raw"}
                                            </span>
                                          )}
                                        </dd>
                                      </div>
                                    );
                                  })}
                                </dl>
                              )}

                              {entries.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setShowRaw(showRaw === log.id ? null : log.id)}
                                  className="mt-2 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                >
                                  {showRaw === log.id ? "Show fields" : "Show raw JSON"}
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            </div>
          ))}

          {(hasMore || loadingMore) && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center py-4 text-sm text-muted-foreground"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Loading more...
                </span>
              ) : (
                "Scroll to load more"
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
