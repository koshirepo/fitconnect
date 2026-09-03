/**
 * Documentation: Razorpay configuration card for gym settings.
 *
 * - Lets a gym admin point online payments at the gym's own Razorpay account. Leaving it empty is a supported choice, not an unfinished one: those gyms collect through the platform account, and the card says so plainly rather than showing an empty form that looks broken.
 * - The secret is write-only. Once saved it is never sent back to the browser, so the field shows a placeholder and an empty submission means "leave it alone" rather than "clear it".
 * - "Test connection" asks Razorpay to accept the credentials before a member ever meets them, which is the difference between finding a typo here and finding it at someone's first payment.
 * - Primary exports: default export.
 */
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import {
  usePaymentGateway,
  useTestPaymentGateway,
  useUpdatePaymentGateway,
} from "@/api/queries/payments";
import { getApiError } from "@/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreditCard, ExternalLink } from "lucide-react";

/** Razorpay never shows a saved secret again, and neither do we. */
const SECRET_PLACEHOLDER = "••••••••••••••••";

export default function PaymentGatewayCard() {
  const { can } = usePermissions();
  const canRead = can(Permission.PAYMENTS_GATEWAY_READ);
  const canEdit = can(Permission.PAYMENTS_GATEWAY_UPDATE);

  const gatewayQuery = usePaymentGateway({ enabled: canRead });
  const updateGateway = useUpdatePaymentGateway();
  const testGateway = useTestPaymentGateway();

  const gateway = gatewayQuery.data;

  // Null means "not edited yet", so the field shows whatever the server holds
  // and a background refetch cannot overwrite something half-typed. Resetting to
  // null after a save re-syncs it to the saved value.
  const [draftKeyId, setDraftKeyId] = React.useState<string | null>(null);
  const [keySecret, setKeySecret] = React.useState("");
  const [webhookSecret, setWebhookSecret] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [confirmClear, setConfirmClear] = React.useState(false);

  const keyId = draftKeyId ?? gateway?.keyId ?? "";

  if (!canRead) return null;

  const usingOwnAccount = gateway?.source === "TENANT";
  const busy = updateGateway.isPending || testGateway.isPending;

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!keyId.trim()) {
      setError("Enter a key id, or use Remove keys to go back to the platform account.");
      return;
    }

    try {
      await updateGateway.mutateAsync({
        keyId: keyId.trim(),
        // Omitted rather than sent empty, so a blank field keeps the stored
        // secret instead of wiping it.
        ...(keySecret.trim() ? { keySecret: keySecret.trim() } : {}),
        ...(webhookSecret.trim() ? { webhookSecret: webhookSecret.trim() } : {}),
      });
      // Back to tracking the server's value now that it matches what was typed.
      setDraftKeyId(null);
      setKeySecret("");
      setWebhookSecret("");
      setMessage("Payment keys saved. This gym now collects into its own Razorpay account.");
    } catch (caught) {
      setError(getApiError(caught));
    }
  };

  const handleClear = async () => {
    setError("");
    setMessage("");
    try {
      await updateGateway.mutateAsync({ keyId: "" });
      setDraftKeyId(null);
      setKeySecret("");
      setWebhookSecret("");
      setMessage("Keys removed. Online payments fall back to the platform account.");
    } catch (caught) {
      setError(getApiError(caught));
    }
  };

  const handleTest = async () => {
    setError("");
    setMessage("");
    try {
      const result = await testGateway.mutateAsync(undefined);
      setMessage(`Razorpay accepted these credentials (${result.keyId}). No money was charged.`);
    } catch (caught) {
      setError(getApiError(caught));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Online Payments
            </CardTitle>
            <CardDescription>
              Let members pay for their membership from the app, through Razorpay.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {gateway?.mode === "LIVE" && <Badge variant="destructive">Live</Badge>}
            {gateway?.mode === "TEST" && <Badge variant="secondary">Test mode</Badge>}
            <Badge variant={gateway?.enabled ? "success" : "secondary"}>
              {gateway?.enabled ? "Active" : "Not set up"}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {gatewayQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <SkeletonText lines={2} />
          </div>
        ) : (
          <>
            {/* Which account the money actually lands in — the thing an admin
                most needs to know, and the easiest thing to get wrong. */}
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              {usingOwnAccount ? (
                <p>
                  Members' payments go to <strong>this gym's Razorpay account</strong> (
                  <code className="text-xs">{gateway?.keyId}</code>).
                </p>
              ) : gateway?.platformConfigured ? (
                <p>
                  Members' payments go to the <strong>platform's Razorpay account</strong>. Add this
                  gym's own keys below to collect directly instead.
                </p>
              ) : (
                <p className="text-amber-600 dark:text-amber-400">
                  Online payments are switched off: no keys are set for this gym, and the platform
                  has no fallback account configured.
                </p>
              )}
            </div>

            {gateway && !gateway.canStoreOwnKeys && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                This server cannot store gym-owned keys yet — its administrator needs to set
                <code className="mx-1 text-xs">CREDENTIALS_KEY</code>on the API.
              </p>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600">
                {message}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="razorpay-key-id">Key ID</Label>
                <Input
                  id="razorpay-key-id"
                  value={keyId}
                  onChange={(e) => setDraftKeyId(e.target.value)}
                  placeholder="rzp_test_xxxxxxxxxxxx"
                  autoComplete="off"
                  disabled={!canEdit || !gateway?.canStoreOwnKeys}
                />
                <p className="text-xs text-muted-foreground">
                  From Razorpay Dashboard → Account &amp; Settings → API Keys.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="razorpay-key-secret">Key Secret</Label>
                <PasswordInput
                  id="razorpay-key-secret"
                  value={keySecret}
                  onChange={(e) => setKeySecret(e.target.value)}
                  placeholder={gateway?.hasKeySecret ? SECRET_PLACEHOLDER : "Paste the key secret"}
                  autoComplete="new-password"
                  disabled={!canEdit || !gateway?.canStoreOwnKeys}
                />
                <p className="text-xs text-muted-foreground">
                  {gateway?.hasKeySecret
                    ? "A secret is saved. Leave this blank to keep it."
                    : "Razorpay shows this once, when the key is created."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="razorpay-webhook-secret">Webhook Secret (optional)</Label>
                <PasswordInput
                  id="razorpay-webhook-secret"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={
                    gateway?.hasWebhookSecret ? SECRET_PLACEHOLDER : "Paste the webhook secret"
                  }
                  autoComplete="new-password"
                  disabled={!canEdit || !gateway?.canStoreOwnKeys}
                />
                <p className="text-xs text-muted-foreground">
                  Lets a payment still be recorded if a member closes the app mid-payment. Add the
                  webhook in Razorpay first, then paste its signing secret here.
                </p>
              </div>

              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={busy || !gateway?.canStoreOwnKeys}>
                    {updateGateway.isPending ? "Saving…" : "Save keys"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTest}
                    disabled={busy || !gateway?.enabled}
                  >
                    {testGateway.isPending ? "Testing…" : "Test connection"}
                  </Button>
                  {usingOwnAccount && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmClear(true)}
                      disabled={busy}
                    >
                      Remove keys
                    </Button>
                  )}
                  <a
                    href="https://dashboard.razorpay.com/app/website-app-settings/api-keys"
                    className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Razorpay dashboard
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </form>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Remove this gym's payment keys?"
        description="Online payments will fall back to the platform's Razorpay account. Payments already taken are not affected."
        confirmLabel="Remove"
        onConfirm={handleClear}
      />
    </Card>
  );
}
