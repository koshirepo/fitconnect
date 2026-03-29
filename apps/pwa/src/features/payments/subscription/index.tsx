import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { paymentsApi } from "@/api/payments";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { Pencil, Plus, Power, Trash2, Package } from "lucide-react";
import type { Subscription } from "@/types/api";

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const { currentTenantId, tenantRole } = useAuthStore();
  const role = tenantRole();
  const isAdmin = role === "ADMIN";

  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState("");

  const [editOpen, setEditOpen] = React.useState(false);
  const [editingSubscription, setEditingSubscription] = React.useState<Subscription | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editAmount, setEditAmount] = React.useState("");
  const [editDurationDays, setEditDurationDays] = React.useState("");
  const [editError, setEditError] = React.useState("");
  const [editSubmitting, setEditSubmitting] = React.useState(false);

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmMode, setConfirmMode] = React.useState<"delete" | "toggle" | null>(null);
  const [selectedSubscription, setSelectedSubscription] = React.useState<Subscription | null>(null);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const fetchSubscriptions = React.useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    setPageError("");
    try {
      const res = await paymentsApi.listSubscriptions(currentTenantId, isAdmin);
      setSubscriptions(res.data.data.subscriptions);
    } catch (err) {
      setPageError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, isAdmin]);

  React.useEffect(() => {
    void fetchSubscriptions();
  }, [fetchSubscriptions]);

  const openEdit = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    setEditTitle(subscription.title);
    setEditDescription(subscription.description ?? "");
    setEditAmount(String(subscription.amount));
    setEditDurationDays(String(subscription.durationDays));
    setEditError("");
    setEditOpen(true);
  };

  const openConfirm = (mode: "delete" | "toggle", subscription: Subscription) => {
    setSelectedSubscription(subscription);
    setConfirmMode(mode);
    setPageError("");
    setConfirmOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId || !editingSubscription) return;

    const amount = Number(editAmount);
    const durationDays = Number.parseInt(editDurationDays, 10);

    if (!editTitle.trim()) {
      setEditError("Plan title is required.");
      return;
    }
    if (!Number.isInteger(amount) || amount < 0) {
      setEditError("Amount must be a whole number in rupees.");
      return;
    }
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      setEditError("Duration must be a whole number greater than 0.");
      return;
    }

    setEditSubmitting(true);
    setEditError("");
    try {
      const res = await paymentsApi.updateSubscription(currentTenantId, editingSubscription.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        amount,
        durationDays,
      });
      const updated = res.data.data.subscription;
      setSubscriptions((prev) =>
        prev.map((subscription) => (subscription.id === updated.id ? updated : subscription)),
      );
      setEditOpen(false);
      setEditingSubscription(null);
    } catch (err) {
      setEditError(getApiError(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentTenantId || !selectedSubscription || !confirmMode) return;

    const actionKey = `${selectedSubscription.id}:${confirmMode}`;
    setActionLoading(actionKey);
    setPageError("");

    try {
      if (confirmMode === "delete") {
        await paymentsApi.deleteSubscription(currentTenantId, selectedSubscription.id);
        setSubscriptions((prev) =>
          prev.filter((subscription) => subscription.id !== selectedSubscription.id),
        );
      } else {
        const res = await paymentsApi.updateSubscription(currentTenantId, selectedSubscription.id, {
          isActive: !selectedSubscription.isActive,
        });
        const updated = res.data.data.subscription;
        setSubscriptions((prev) =>
          prev.map((subscription) => (subscription.id === updated.id ? updated : subscription)),
        );
      }
    } catch (err) {
      setPageError(getApiError(err));
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  const confirmTitle =
    confirmMode === "delete"
      ? `Delete "${selectedSubscription?.title ?? "plan"}"?`
      : `${selectedSubscription?.isActive ? "Inactivate" : "Activate"} "${selectedSubscription?.title ?? "plan"}"?`;
  const confirmDescription =
    confirmMode === "delete"
      ? "This permanently removes the subscription plan if it has no payment history."
      : selectedSubscription?.isActive
        ? "Members will no longer see or use this plan for new payments."
        : "This plan will become available again for new payments.";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Manage subscription plans" : "Available plans"}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/subscriptions/create")}>
            <Plus className="h-4 w-4" />
            New Plan
          </Button>
        )}
      </div>

      {pageError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {pageError}
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No subscription plans"
          description={
            isAdmin ? "Create subscription plans for your gym members." : "No plans available yet."
          }
          action={
            isAdmin ? (
              <Button onClick={() => navigate("/subscriptions/create")}>
                <Plus className="h-4 w-4" />
                Create Plan
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((sub) => {
            const toggleActionKey = `${sub.id}:toggle`;
            const deleteActionKey = `${sub.id}:delete`;

            return (
              <Card key={sub.id} className={!sub.isActive ? "opacity-75" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base">{sub.title}</CardTitle>
                    <Badge variant={sub.isActive ? "success" : "secondary"}>
                      {sub.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {sub.description && <CardDescription>{sub.description}</CardDescription>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{formatCurrency(sub.amount)}</span>
                    <span className="text-muted-foreground">/ {sub.durationDays} days</span>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(sub)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openConfirm("toggle", sub)}
                        disabled={actionLoading === toggleActionKey}
                      >
                        <Power className="h-3.5 w-3.5" />
                        {sub.isActive ? "Inactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openConfirm("delete", sub)}
                        disabled={actionLoading === deleteActionKey}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent onClose={() => setEditOpen(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Subscription Plan</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subscription-title">Plan Title</Label>
              <Input
                id="subscription-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Monthly Basic"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subscription-description">Description</Label>
              <Textarea
                id="subscription-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                placeholder="Optional plan details"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subscription-amount">Amount (in rupees)</Label>
                <Input
                  id="subscription-amount"
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  min={0}
                  step={1}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subscription-duration">Duration (days)</Label>
                <Input
                  id="subscription-duration"
                  type="number"
                  value={editDurationDays}
                  onChange={(e) => setEditDurationDays(e.target.value)}
                  min={1}
                  step={1}
                  required
                />
              </div>
            </div>

            {editError && <p className="text-sm text-destructive">{editError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmMode === "delete" ? "Delete" : selectedSubscription?.isActive ? "Inactivate" : "Activate"}
        variant={confirmMode === "delete" ? "destructive" : "default"}
        loading={!!actionLoading}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
