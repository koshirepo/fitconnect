/**
 * Documentation: Record one platform payment against a gym.
 *
 * - A page rather than a dialog, because recording a payment moves the gym's access expiry and deserves the same undivided screen every other money entry in the app gets.
 * - Reached from the gym's detail page and returns there on success; the caches it invalidates are the ones that render the new expiry.
 * - SUPER_ADMIN only, checked here as well as on the route, so a typed URL is not a way in.
 * - Primary exports: RecordPlatformPaymentPage.
 */
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { tenantsApi } from "@/api/tenants";
import { getApiError } from "@/api/client";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function RecordPlatformPaymentPage() {
  const navigate = useNavigate();
  const { tenantId } = useParams<{ tenantId: string }>();
  const queryClient = useQueryClient();
  const canManageBilling = useAuthStore((s) => s.user?.platformRole === "SUPER_ADMIN");

  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [extendsUntil, setExtendsUntil] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  const backToTenant = () => navigate(`/tenants/${tenantId}`);

  if (!canManageBilling) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only super admins can record platform payments.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={backToTenant}>
              <ArrowLeft className="h-4 w-4" />
              Back to Gym
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount in whole rupees.");
      return;
    }
    if (!extendsUntil) {
      setError("Select an expiry date.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await tenantsApi.recordPlatformPayment(tenantId, {
        amount: parsedAmount,
        note: note || undefined,
        extendsUntil: new Date(extendsUntil).toISOString(),
      });
      // The expiry drives the gym's badge on the platform table, so that cache
      // is cleared alongside the gym's own record.
      await queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all() });
      backToTenant();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Record Platform Payment</h1>
        <p className="text-muted-foreground">
          Log a payment from this gym and extend how long its access runs.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment</CardTitle>
            <CardDescription>What was paid, and how far it carries access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pp-amount">
                Amount (₹) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pp-amount"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 1200"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Enter amount in rupees (₹)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-expiry">
                Extends Access Until <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pp-expiry"
                type="date"
                value={extendsUntil}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setExtendsUntil(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-note">Note (optional)</Label>
              <Textarea
                id="pp-note"
                placeholder="e.g. Annual subscription payment"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={backToTenant} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Record Payment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
