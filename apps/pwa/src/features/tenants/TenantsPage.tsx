import * as React from "react";
import { flattenPages } from "@/api/queries/shared";
import { useTenantsInfinite, useUpdateTenantStatus } from "@/api/queries/platform";
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
import { Spinner } from "@/components/ui/spinner";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
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
  const query = useTenantsInfinite();
  const updateStatus = useUpdateTenantStatus();

  const tenants = React.useMemo(
    () => flattenPages<Tenant>(query.data?.pages),
    [query.data],
  );
  const loading = query.isLoading;
  const loadingMore = query.isFetchingNextPage;

  const loadMoreRef = useInfiniteScroll({
    hasMore: Boolean(query.hasNextPage),
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  });

  // The mutation invalidates the tenants key, so the list refetches itself.
  const handleStatusToggle = (tenant: Tenant) => {
    updateStatus.mutate({
      tenantId: tenant.id,
      status: tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
    });
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
        <ListPageSkeleton search={false} filters={0} />
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
            {tenants.length > 0 && (query.hasNextPage || loadingMore) && (
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
