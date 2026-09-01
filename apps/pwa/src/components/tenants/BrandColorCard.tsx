/**
 * Documentation: The gym's accent colour, on its own.
 *
 * - Lives on the main Settings page rather than inside the public-page form, because the colour is not a public-page setting: it paints the dashboard, the storefront, the signup form, and the ID card alike. Filed under "Public Page" it was somewhere no admin looking to restyle their dashboard would ever think to look.
 * - Saves only `brandColor`. A card that sent the whole tenant payload would overwrite the name, logo, and about text with whatever it happened to be holding — which is exactly the trap the combined form was in.
 * - Choosing a colour turns the setting on. The checkbox stays as the way back to the platform default, because "no colour" is a real choice and needs to stay reachable.
 * - Primary exports: BrandColorCard.
 */
import * as React from "react";
import { getApiError } from "@/api/client";
import { useUpdateTenant } from "@/api/queries/platform";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette } from "lucide-react";
import { isTenantSubdomain } from "@/lib/subdomain";
import { readCachedTenantBranding, writeCachedTenantBranding } from "@/lib/tenant-branding";
import type { Tenant } from "@/types/api";

/** The platform's own accent, shown as the starting point. */
const DEFAULT_BRAND = "#E2571E";

export function BrandColorCard({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  onSaved?: (tenant: Tenant) => void;
}) {
  const updateTenant = useUpdateTenant();

  const [color, setColor] = React.useState(tenant.brandColor ?? DEFAULT_BRAND);
  /** Off means the platform default, which is what a null column means. */
  const [enabled, setEnabled] = React.useState(Boolean(tenant.brandColor));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");

  // Re-sync when the record changes under us, so the form shows what is stored
  // rather than what was last typed.
  React.useEffect(() => {
    setColor(tenant.brandColor ?? DEFAULT_BRAND);
    setEnabled(Boolean(tenant.brandColor));
  }, [tenant.brandColor, tenant.id]);

  const dirty = enabled !== Boolean(tenant.brandColor) || (enabled && color !== tenant.brandColor);

  const handleSave = async () => {
    setError("");
    setSuccessMsg("");
    setSaving(true);

    try {
      const { tenant: updated } = await updateTenant.mutateAsync({
        tenantId: tenant.id,
        data: { brandColor: enabled ? color : null },
      });

      /**
       * Repaint now, not on the next reload.
       *
       * The accent is read at the app root from the branding cache, which lives
       * six hours. Rewriting it here fires the event that root listens on, so
       * the new colour reaches this very page as soon as it is saved.
       */
      if (isTenantSubdomain()) {
        const cached = readCachedTenantBranding();
        writeCachedTenantBranding({
          ...(cached ?? {}),
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          logoUrl: updated.logoUrl ?? null,
          brandColor: updated.brandColor ?? null,
        });
      }

      setSuccessMsg("Brand colour updated.");
      onSaved?.(updated);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Brand Colour
        </CardTitle>
        <CardDescription>
          Used across every page on your gym&apos;s address — the dashboard, the storefront,
          the signup form, and member ID cards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="brand-color" className="sr-only">
            Brand colour
          </Label>
          <input
            id="brand-color"
            type="color"
            value={color}
            disabled={saving}
            onChange={(e) => {
              setColor(e.target.value);
              setEnabled(true);
            }}
            className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1 disabled:opacity-50"
          />
          <Input
            value={color}
            disabled={saving}
            onChange={(e) => {
              setColor(e.target.value);
              setEnabled(true);
            }}
            placeholder={DEFAULT_BRAND}
            className="w-32 font-mono"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={enabled}
              disabled={saving}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Use our own colour
          </label>
        </div>

        {!enabled && (
          <p className="text-xs text-muted-foreground">
            Using the FitConnect colour. Pick one above to use your own.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {successMsg && <p className="text-sm text-emerald-600">{successMsg}</p>}

        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save colour"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
