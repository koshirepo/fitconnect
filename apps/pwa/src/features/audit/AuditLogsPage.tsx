import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import { auditApi } from "@/api/audit";
import { getApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
import type { AuditLog } from "@/types/api";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

interface Props {
  scope?: "platform" | "tenant";
}

export default function AuditLogsPage({ scope = "tenant" }: Props) {
  const { currentTenantId, isPlatformStaff } = useAuthStore();
  const effectiveScope = scope === "platform" && isPlatformStaff() ? "platform" : "tenant";

  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState("");

  // Paging
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const limit = 20;

  // Filters
  const [actionFilter, setActionFilter] = React.useState("");
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  const fetchLogs = React.useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError("");
      try {
        let res;
        if (effectiveScope === "platform") {
          res = await auditApi.platformLogs(nextPage, limit, undefined, actionFilter || undefined);
        } else {
          if (!currentTenantId) {
            if (mode === "replace") setLoading(false);
            else setLoadingMore(false);
            return;
          }
          res = await auditApi.tenantLogs(currentTenantId, nextPage, limit);
        }

        const nextLogs = res.data.data.logs;
        setLogs((prev) => (mode === "replace" ? nextLogs : appendUniqueById(prev, nextLogs)));
        const totalPages =
          res.data.meta.totalPages ?? Math.ceil((res.data.meta.total ?? 0) / limit);
        setHasMore(nextPage < totalPages);
        setPage(nextPage);
      } catch (err) {
        setError(getApiError(err));
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [effectiveScope, currentTenantId, actionFilter],
  );

  React.useEffect(() => {
    setLogs([]);
    setHasMore(true);
    void fetchLogs(1, "replace");
  }, [fetchLogs]);

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchLogs(page + 1, "append");
  }, [loading, loadingMore, hasMore, page, fetchLogs]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  const actionBadgeVariant = (action: string) => {
    if (action.includes("CREATE") || action.includes("ADD")) return "success";
    if (action.includes("DELETE") || action.includes("REMOVE")) return "destructive";
    if (action.includes("UPDATE") || action.includes("CHANGE")) return "warning";
    return "secondary";
  };

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {effectiveScope === "platform" ? "Platform " : ""}Audit Logs
        </h1>
        <Card>
          <CardContent className="py-8 text-center text-destructive-foreground">
            {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">
        {effectiveScope === "platform" ? "Platform " : ""}Audit Logs
      </h1>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Action</label>
              <Select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                }}
              >
                <option value="">All actions</option>
                <option value="LOGIN">LOGIN</option>
                <option value="LOGOUT">LOGOUT</option>
                <option value="CREATE_TENANT">CREATE_TENANT</option>
                <option value="UPDATE_TENANT">UPDATE_TENANT</option>
                <option value="ADD_MEMBER">ADD_MEMBER</option>
                <option value="REMOVE_MEMBER">REMOVE_MEMBER</option>
                <option value="CHANGE_ROLE">CHANGE_ROLE</option>
                <option value="CREATE_PAYMENT">CREATE_PAYMENT</option>
                <option value="UPDATE_PAYMENT">UPDATE_PAYMENT</option>
                <option value="CREATE_SUBSCRIPTION">CREATE_SUBSCRIPTION</option>
                <option value="CREATE_WORKOUT_PLAN">CREATE_WORKOUT_PLAN</option>
                <option value="UPDATE_WORKOUT_PLAN">UPDATE_WORKOUT_PLAN</option>
                <option value="DELETE_WORKOUT_PLAN">DELETE_WORKOUT_PLAN</option>
                <option value="ASSIGN_WORKOUT_PLAN">ASSIGN_WORKOUT_PLAN</option>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActionFilter("");
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      {loading ? (
        <PageLoader />
      ) : (
        <Card>
          <CardContent className="p-0">
            {logs.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No audit logs"
                description="No logs match the current filters."
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      {effectiveScope === "platform" && <TableHead>Tenant</TableHead>}
                      <TableHead>IP</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <React.Fragment key={log.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                        >
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                actionBadgeVariant(log.action) as
                                  | "success"
                                  | "destructive"
                                  | "warning"
                                  | "secondary"
                              }
                            >
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.actor?.name ?? log.actorId ?? "—"}
                          </TableCell>
                          {effectiveScope === "platform" && (
                            <TableCell className="text-sm">{log.tenantId ?? "—"}</TableCell>
                          )}
                          <TableCell className="text-xs text-muted-foreground">
                            {log.ipAddress ?? "—"}
                          </TableCell>
                          <TableCell>
                            {expandedRow === log.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedRow === log.id && (
                          <TableRow>
                            <TableCell colSpan={effectiveScope === "platform" ? 6 : 5}>
                              <div className="bg-muted/50 rounded-md p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                                {log.metadata
                                  ? JSON.stringify(log.metadata, null, 2)
                                  : "No details available"}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>

                {logs.length > 0 && (hasMore || loadingMore) && (
                  <div className="p-4 border-t">
                    <div
                      ref={loadMoreRef}
                      className="flex items-center justify-center text-sm text-muted-foreground"
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
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
