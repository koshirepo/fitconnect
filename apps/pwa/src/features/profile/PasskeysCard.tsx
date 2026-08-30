/**
 * Documentation: Managing the passkeys on an account.
 *
 * - Where a member turns their phone into their password. It matters more here than in most apps: a member added at the desk is given their phone number as a password and, when they gave no email, an address invented for them that they will never type correctly. A passkey replaces both with a fingerprint.
 * - Renders nothing at all on a browser that cannot do it. Explaining a feature somebody cannot use is worse than being quiet about it, and the fallback — a password — is already on screen everywhere else.
 * - Removing the last passkey is allowed. The password still works, so this is not a door anybody can lock themselves out of; a screen that refused would be protecting against a problem that does not exist.
 * - Primary exports: PasskeysCard.
 */
import * as React from "react";
import { Fingerprint, Plus, Trash2 } from "lucide-react";

import {
  isPasskeySupported,
  passkeysApi,
  registerPasskey,
  PasskeyCancelled,
  type Passkey,
} from "@/api/passkeys";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

/** A sensible default name, so nobody has to invent one to get started. */
function guessDeviceName() {
  if (typeof navigator === "undefined") return "";
  const agent = navigator.userAgent;
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Android/.test(agent)) return "Android phone";
  if (/Mac OS X/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows PC";
  return "This device";
}

export function PasskeysCard() {
  const toast = useToast();
  const [supported] = React.useState(isPasskeySupported);

  const [passkeys, setPasskeys] = React.useState<Passkey[]>([]);
  // Seeded from support rather than set to false in the effect: a browser that
  // cannot do this has nothing to load, and saying so during the first render
  // beats a spinner that exists for one frame.
  const [loading, setLoading] = React.useState(supported);
  const [adding, setAdding] = React.useState(false);
  const [label, setLabel] = React.useState(guessDeviceName);
  const [removing, setRemoving] = React.useState<Passkey | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const { data } = await passkeysApi.list();
      setPasskeys(data.data.passkeys);
    } catch {
      // A roster that will not load is not worth an error on a settings page;
      // the card simply shows none, and adding one still works.
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!supported) return;
    void refresh();
  }, [supported, refresh]);

  if (!supported) return null;

  const handleAdd = async () => {
    setAdding(true);
    try {
      await registerPasskey(label);
      toast.success("Passkey added. You can sign in with it from now on.");
      await refresh();
    } catch (error) {
      // Closing the native prompt is a decision, not a failure.
      if (!(error instanceof PasskeyCancelled)) toast.error(getApiError(error));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async () => {
    const target = removing;
    setRemoving(null);
    if (!target) return;

    try {
      await passkeysApi.remove(target.id);
      toast.success("Passkey removed.");
      await refresh();
    } catch (error) {
      toast.error(getApiError(error));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Fingerprint className="h-5 w-5" />
          Passkeys
        </CardTitle>
        <CardDescription>
          Sign in with your fingerprint, face, or screen lock instead of a password. The
          key stays on your device — this gym never sees it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No passkeys yet. Add one and your password becomes a backup rather than the
            thing you have to remember.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {passkeys.map((passkey) => (
              <li key={passkey.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {passkey.label ?? "Unnamed device"}
                    {passkey.discoverable && (
                      <Badge variant="secondary" className="text-[10px]">
                        Synced
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Added {formatDate(passkey.createdAt)}
                    {passkey.lastUsedAt
                      ? ` · last used ${formatDate(passkey.lastUsedAt)}`
                      : " · never used"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${passkey.label ?? "this passkey"}`}
                  onClick={() => setRemoving(passkey)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="passkey-label">Name this device</Label>
            <Input
              id="passkey-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Pixel 8"
            />
          </div>
          <Button onClick={handleAdd} disabled={adding}>
            <Plus className="h-4 w-4" />
            {adding ? "Waiting…" : "Add a passkey"}
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this passkey?"
        description={`You will no longer be able to sign in with ${
          removing?.label ?? "this device"
        }. Your password still works.`}
        confirmLabel="Remove"
        onConfirm={handleRemove}
      />
    </Card>
  );
}
