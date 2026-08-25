import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import { useAuditLogsInfinite } from "@/api/queries/platform";
import { flattenPages } from "@/api/queries/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import type { AuditLog } from "@/types/api";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";

interface Props {
  scope?: "platform" | "tenant";
}

export default function AuditLogsPage({ scope = "tenant" }: Props) {
  const { isPlatformStaff } = useAuthStore();
  const effectiveScope = scope === "platform" && isPlatformStaff() ? "platform" : "tenant";

  // Filters
  const [actionFilter, setActionFilter] = React.useState("");
  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  // The action filter only narrows the platform feed; the tenant endpoint takes
  // no filter, so passing it there would only fragment the cache for nothing.
  const logsQuery = useAuditLogsInfinite(
    effectiveScope,
    effectiveScope === "platform" ? { action: actionFilter || undefined } : {},
  );

  const logs = React.useMemo(() => flattenPages<AuditLog>(logsQuery.data?.pages), [logsQuery.data]);
  const loading = logsQuery.isLoading;
  const loadingMore = logsQuery.isFetchingNextPage;
  const hasMore = Boolean(logsQuery.hasNextPage);
  const error = logsQuery.isError ? getApiError(logsQuery.error) : "";

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (logsQuery.hasNextPage && !logsQuery.isFetchingNextPage) {
        void logsQuery.fetchNextPage();
      }
    },
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
                onValueChange={(value) => {
                  setActionFilter(value ?? "");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All actions</SelectItem>
                  <SelectItem value="LOGIN">LOGIN</SelectItem>
                  <SelectItem value="LOGOUT">LOGOUT</SelectItem>
                  <SelectItem value="CREATE_TENANT">CREATE_TENANT</SelectItem>
                  <SelectItem value="UPDATE_TENANT">UPDATE_TENANT</SelectItem>
                  <SelectItem value="ADD_MEMBER">ADD_MEMBER</SelectItem>
                  <SelectItem value="REMOVE_MEMBER">REMOVE_MEMBER</SelectItem>
                  <SelectItem value="CHANGE_ROLE">CHANGE_ROLE</SelectItem>
                  <SelectItem value="CREATE_PAYMENT">CREATE_PAYMENT</SelectItem>
                  <SelectItem value="UPDATE_PAYMENT">UPDATE_PAYMENT</SelectItem>
                  <SelectItem value="CREATE_SUBSCRIPTION">CREATE_SUBSCRIPTION</SelectItem>
                  <SelectItem value="CREATE_WORKOUT_PLAN">CREATE_WORKOUT_PLAN</SelectItem>
                  <SelectItem value="UPDATE_WORKOUT_PLAN">UPDATE_WORKOUT_PLAN</SelectItem>
                  <SelectItem value="DELETE_WORKOUT_PLAN">DELETE_WORKOUT_PLAN</SelectItem>
                  <SelectItem value="ASSIGN_WORKOUT_PLAN">ASSIGN_WORKOUT_PLAN</SelectItem>
                </SelectContent>
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
