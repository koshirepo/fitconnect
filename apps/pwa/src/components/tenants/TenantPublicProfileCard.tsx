import * as React from "react";
import { getApiError } from "@/api/client";
import { useUpdateTenant } from "@/api/queries/platform";
import { uploadsApi } from "@/api/uploads";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { PhotoCapture } from "@/components/ui/photo-capture";
import { Textarea } from "@/components/ui/textarea";
import type { Tenant, UpdateTenantPayload } from "@/types/api";
import { AlertCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { buildTenantPublicUrl } from "@/lib/subdomain";

const validators = {
  name: (value: string): string | null => {
    if (!value || value.trim().length < 2) return "Gym name must be at least 2 characters";
    if (value.trim().length > 120) return "Gym name must be at most 120 characters";
    return null;
  },
  phone: (value: string): string | null => {
    if (!value.trim()) return null;
    if (value.trim().length < 6) return "Phone must be at least 6 characters";
    if (value.trim().length > 20) return "Phone must be at most 20 characters";
    return null;
  },
  address: (value: string): string | null => {
    if (!value.trim()) return null;
    if (value.trim().length > 500) return "Address must be at most 500 characters";
    return null;
  },
  description: (value: string): string | null => {
    if (!value.trim()) return null;
    if (value.trim().length > 300) return "Short description must be at most 300 characters";
    return null;
  },
  markdown: (value: string): string | null => {
    if (!value.trim()) return null;
    if (value.length > 20000) return "Description must be at most 20000 characters";
    return null;
  },
};

function isValidUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

interface TenantPublicProfileCardProps {
  tenant: Tenant;
  onSaved?: (tenant: Tenant) => void;
  title?: string;
  description?: string;
}

export function TenantPublicProfileCard({
  tenant,
  onSaved,
  title = "Public Page",
  description = "Manage the public profile details shown on your gym page.",
}: TenantPublicProfileCardProps) {
  const [name, setName] = React.useState(tenant.name);
  const updateTenant = useUpdateTenant();
  const [phone, setPhone] = React.useState(tenant.phone ?? "");
  const [address, setAddress] = React.useState(tenant.address ?? "");
  const [shortDescription, setShortDescription] = React.useState(tenant.description ?? "");
  const [markdown, setMarkdown] = React.useState(tenant.markdown ?? "");
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(tenant.logoUrl ?? null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setName(tenant.name);
    setPhone(tenant.phone ?? "");
    setAddress(tenant.address ?? "");
    setShortDescription(tenant.description ?? "");
    setMarkdown(tenant.markdown ?? "");
    setLogoFile(null);
    setLogoPreview(tenant.logoUrl ?? null);
    setError("");
    setFieldErrors({});
  }, [
    tenant.address,
    tenant.description,
    tenant.id,
    tenant.logoUrl,
    tenant.markdown,
    tenant.name,
    tenant.phone,
  ]);

  React.useEffect(() => {
    setSuccessMsg("");
  }, [tenant.id]);

  const validateForm = React.useCallback(() => {
    const nextErrors: Record<string, string> = {};

    const nameError = validators.name(name);
    if (nameError) nextErrors.name = nameError;

    const phoneError = validators.phone(phone);
    if (phoneError) nextErrors.phone = phoneError;

    const addressError = validators.address(address);
    if (addressError) nextErrors.address = addressError;

    const descriptionError = validators.description(shortDescription);
    if (descriptionError) nextErrors.description = descriptionError;

    const markdownError = validators.markdown(markdown);
    if (markdownError) nextErrors.markdown = markdownError;

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [address, markdown, name, phone, shortDescription]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!validateForm()) {
      setError("Please fix the validation errors below.");
      return;
    }

    setSaving(true);
    try {
      let nextLogoUrl = logoPreview;

      if (logoFile) {
        const uploadLogoRes = await uploadsApi.uploadLogo(logoFile);
        const uploadedLogoUrl = uploadLogoRes?.data?.data?.url;
        if (!isValidUrl(uploadedLogoUrl)) {
          throw new Error("Invalid logo URL returned from server");
        }
        nextLogoUrl = uploadedLogoUrl;
      }

      const payload: UpdateTenantPayload = {
        name: name.trim(),
        phone: phone.trim() ? phone.trim() : null,
        address: address.trim() ? address.trim() : null,
        logoUrl: nextLogoUrl ?? null,
        description: shortDescription.trim() ? shortDescription.trim() : null,
        markdown: markdown.trim() ? markdown.trim() : null,
      };

      // Invalidates the tenants keys, so the sidebar and platform table pick up
      // the new name and logo alongside the event dispatched below.
      const { tenant: updatedTenant } = await updateTenant.mutateAsync({
        tenantId: tenant.id,
        data: payload,
      });
      setLogoFile(null);
      setSuccessMsg("Public page updated.");
      window.dispatchEvent(
        new CustomEvent("tenant-updated", {
          detail: { tenant: updatedTenant },
        }),
      );
      onSaved?.(updatedTenant);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = buildTenantPublicUrl(tenant.slug);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Preview Public Page
          </a>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMsg}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tenant-public-name">Gym Name</Label>
                  <Input
                    id="tenant-public-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={saving}
                    className={fieldErrors.name ? "border-red-500 focus-visible:ring-red-500" : ""}
                  />
                  {fieldErrors.name && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenant-public-slug">Public Slug</Label>
                  <Input
                    id="tenant-public-slug"
                    value={tenant.slug}
                    disabled
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground">
                    Used in the public URL: <span className="font-mono">{publicUrl}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Public slug stays read-only.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tenant-public-email">Email</Label>
                  <Input
                    id="tenant-public-email"
                    type="email"
                    value={tenant.email ?? ""}
                    disabled
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground">
                    Email stays read-only.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tenant-public-phone">Phone</Label>
                  <Input
                    id="tenant-public-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={saving}
                    placeholder="+91 98765 43210"
                    className={fieldErrors.phone ? "border-red-500 focus-visible:ring-red-500" : ""}
                  />
                  {fieldErrors.phone && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      {fieldErrors.phone}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenant-public-address">Address</Label>
                <Textarea
                  id="tenant-public-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={saving}
                  rows={3}
                  placeholder="Enter the address shown on your public page"
                  className={fieldErrors.address ? "border-red-500 focus-visible:ring-red-500" : ""}
                />
                {fieldErrors.address && (
                  <p className="flex items-center gap-1 text-xs text-red-600">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.address}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenant-public-description">Short Description</Label>
                <Textarea
                  id="tenant-public-description"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  disabled={saving}
                  rows={3}
                  placeholder="A short tagline shown below the gym name on the public page"
                  className={
                    fieldErrors.description ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.description && (
                  <p className="flex items-center gap-1 text-xs text-red-600">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{shortDescription.length}/300</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Gym Logo</Label>
              <PhotoCapture
                value={logoPreview}
                onChange={(file, preview) => {
                  setLogoFile(file);
                  setLogoPreview(preview);
                }}
                requireFace={false}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Upload a logo or remove it to hide the current one.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <MarkdownEditor
              id="tenant-public-markdown"
              label="About / Description"
              value={markdown}
              onChange={setMarkdown}
              disabled={saving}
              rows={10}
              placeholder={
                "Write a description using Markdown...\n\n## About Our Gym\n\nWelcome to our gym!\n\n### Facilities\n- Cardio zone\n- Weight room"
              }
              hint="Supports headings, lists, tables, links, and emphasis."
            />
            {fieldErrors.markdown && (
              <p className="flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                {fieldErrors.markdown}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Public Page"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
