/**
 * Documentation: Outgoing mail configuration card for gym settings.
 *
 * - Lets a gym send its members' email from its own mailbox instead of the platform's. Leaving it empty is a supported choice, not an unfinished one — those gyms send through the platform account, and the card says which is in use rather than showing an empty form that looks broken. The payment gateway card takes the same shape for the same reason.
 * - The password is write-only. Once saved it is never sent back, so the field shows a placeholder and an empty submission means "leave the saved one alone" rather than "clear it".
 * - Saving verifies against the mail server first, so a mistyped app password is caught while somebody is looking at the form rather than three weeks later when a member's password reset never arrives.
 * - Primary exports: default export.
 */
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import {
  useTenantEmail,
  useTestTenantEmail,
  useUpdateTenantEmail,
} from "@/api/queries/catalog";
import { getApiError } from "@/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Mail } from "lucide-react";

/** A saved password is never shown again, so the field stands in for one. */
const PASSWORD_PLACEHOLDER = "••••••••••••";

export default function EmailSenderCard() {
  const { can } = usePermissions();
  const canRead = can(Permission.SETTINGS_EMAIL_READ);
  const canEdit = can(Permission.SETTINGS_EMAIL_UPDATE);

  const emailQuery = useTenantEmail({ enabled: canRead });
  const updateEmail = useUpdateTenantEmail();
  const testEmail = useTestTenantEmail();

  const config = emailQuery.data;

  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState("587");
  const [secure, setSecure] = React.useState(false);
  const [user, setUser] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  // Seed from what is saved once it arrives.
  React.useEffect(() => {
    if (!config) return;
    setHost(config.host ?? "");
    setPort(config.port === null ? "587" : String(config.port));
    setSecure(config.secure ?? false);
    setUser(config.user ?? "");
    setFrom(config.from ?? "");
  }, [config]);

  if (!canRead) return null;

  if (emailQuery.isLoading || !config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-5" />
            Sending email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const usingOwn = config.source === "TENANT";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const result = await updateEmail.mutateAsync({
        host: host.trim(),
        port: Number(port) || 587,
        secure,
        user: user.trim(),
        // Omitted rather than empty: the API reads "absent" as "keep the
        // saved one", and an empty string would be a password of no length.
        ...(password ? { password } : {}),
        from: from.trim(),
      });
      setPassword("");
      setNotice(
        result.verified
          ? "Saved. The mail server accepted these details."
          : "Saved.",
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setConfirmClear(false);
    setError("");
    setNotice("");
    setSaving(true);
    try {
      // An empty host is the clear signal, the same way it is for the gateway.
      await updateEmail.mutateAsync({ host: "" });
      setPassword("");
      setNotice("Cleared. This gym now sends through the platform mailbox.");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setError("");
    setNotice("");
    setTesting(true);
    try {
      const result = await testEmail.mutateAsync(undefined);
      setNotice(
        `The mailbox answered. Members see mail from ${result.sendingFrom}` +
          (result.source === "PLATFORM" ? " (the platform's, not this gym's)." : "."),
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Mail className="size-5" />
          Sending email
          {config.enabled ? (
            <Badge variant={usingOwn ? "default" : "secondary"}>
              {usingOwn ? "This gym's mailbox" : "Platform mailbox"}
            </Badge>
          ) : (
            <Badge variant="destructive">Not configured</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {config.enabled ? (
            <>
              Welcome messages, password resets and reports go out from{" "}
              <strong>{config.sendingFrom}</strong>.{" "}
              {usingOwn
                ? "Replies reach you."
                : "Set your own below so members hear from you, and replies reach you rather than the platform."}
            </>
          ) : (
            "No mailbox is configured, here or on the platform, so no email is being sent at all."
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!config.canStoreSecrets && (
          <p className="rounded-md bg-amber-500/10 p-3 text-xs text-amber-600">
            This deployment cannot store a gym's mail password yet — the API has no
            CREDENTIALS_KEY set. You can still clear an existing one.
          </p>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email-host">Mail server</Label>
              <Input
                id="email-host"
                value={host}
                disabled={!canEdit}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.gmail.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-port">Port</Label>
              <Input
                id="email-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                disabled={!canEdit}
                onChange={(e) => setPort(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                587 for STARTTLS, 465 for TLS. Tick below only for 465.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-user">Username</Label>
              <Input
                id="email-user"
                value={user}
                disabled={!canEdit}
                onChange={(e) => setUser(e.target.value)}
                placeholder="hello@yourgym.in"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-password">Password</Label>
              <PasswordInput
                id="email-password"
                value={password}
                disabled={!canEdit}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={config.passwordSet ? PASSWORD_PLACEHOLDER : "App password"}
              />
              <p className="text-xs text-muted-foreground">
                {config.passwordSet
                  ? "A password is saved. Leave this blank to keep it."
                  : "For Gmail this is an app password, not your account password."}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-from">From address</Label>
            <Input
              id="email-from"
              value={from}
              disabled={!canEdit}
              onChange={(e) => setFrom(e.target.value)}
              placeholder={`"Your Gym" <hello@yourgym.in>`}
            />
            <p className="text-xs text-muted-foreground">
              What members see in their inbox. Leave blank to send as the username above.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={secure}
              disabled={!canEdit}
              onChange={(e) => setSecure(e.target.checked)}
              className="size-4 rounded"
            />
            Use TLS from the start (port 465)
          </label>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {notice && (
            <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600">{notice}</div>
          )}

          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Button type="submit" disabled={saving || !config.canStoreSecrets}>
                {saving ? "Checking and saving..." : "Save mailbox"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? "Testing..." : "Test connection"}
            </Button>
            {canEdit && usingOwn && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmClear(true)}
                disabled={saving}
              >
                Use the platform mailbox
              </Button>
            )}
          </div>
        </form>
      </CardContent>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Send through the platform mailbox?"
        description="This gym's mail server details and password are deleted. Members will start receiving email from the platform address instead of yours, and replies will go there."
        confirmLabel="Clear and fall back"
        onConfirm={handleClear}
      />
    </Card>
  );
}
