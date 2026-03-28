import * as React from "react";
import { tenantsApi } from "@/api/tenants";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { Plus, Building2 } from "lucide-react";
import type { Tenant } from "@/types/api";
import { Link } from "react-router-dom";

function getPlatformExpiryBadge(platformExpiresAt?: string | null) {
  if (!platformExpiresAt) {
    return <Badge variant="secondary">No expiry set</Badge>;
  }
  const expiry = new Date(platformExpiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) {
    return <Badge variant="destructive">Expired</Badge>;
  }
  if (daysLeft <= 7) {
    return <Badge variant="warning">Expires in {daysLeft}d</Badge>;
  }
  return <Badge variant="success">{formatDate(platformExpiresAt)}</Badge>;
}

export default function TenantsPage() {
  const [tenants, setTenants] = React.useState<Tenant[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const fetchTenants = React.useCallback(async (nextPage: number, mode: "replace" | "append") => {
    if (mode === "replace") {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await tenantsApi.list(nextPage, 20);
      const nextTenants = res.data.data.tenants;
      setTenants((prev) =>
        mode === "replace" ? nextTenants : appendUniqueById(prev, nextTenants),
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
  }, []);

  React.useEffect(() => {
    setTenants([]);
    setHasMore(true);
    void fetchTenants(1, "replace");
  }, [fetchTenants]);

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchTenants(page + 1, "append");
  }, [loading, loadingMore, hasMore, page, fetchTenants]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  const handleStatusToggle = async (tenant: Tenant) => {
    const newStatus = tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await tenantsApi.updateStatus(tenant.id, newStatus);
      fetchTenants(1, "replace");
    } catch {
      // silent
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground">Manage gym tenants</p>
        </div>
        <Link to="/tenants/add" className={buttonVariants()}>
          <Plus className="h-4 w-4" />
          Add Tenant
        </Link>
      </div>

      {loading ? (
        <PageLoader />
      ) : tenants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No tenants yet"
          description="Create your first gym tenant to get started."
          action={
            <Link to="/tenants/add" className={buttonVariants()}>
              <Plus className="h-4 w-4" />
              Create Tenant
            </Link>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Platform Access</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <Link to={`/tenants/${t.slug}`}>{t.name}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.slug}</TableCell>
                    <TableCell>{t.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "ACTIVE" ? "success" : "destructive"}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{getPlatformExpiryBadge(t.platformExpiresAt)}</TableCell>
                    <TableCell>{formatDate(t.createdAt)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => handleStatusToggle(t)}>
                        {t.status === "ACTIVE" ? "Suspend" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {tenants.length > 0 && (hasMore || loadingMore) && (
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
