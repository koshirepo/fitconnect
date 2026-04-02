import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toSlug } from "@/shared/utils";
import { tenantsApi } from "@/api/tenants";
import { uploadsApi } from "@/api/uploads";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoCapture } from "@/components/ui/photo-capture";
import type { CreateTenantPayload } from "@/types/api";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { AlertCircle, Building2, CheckCircle2, AlertTriangle } from "lucide-react";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Simple client-side validation functions
const validators = {
  tenantName: (value: string): string | null => {
    if (!value || value.trim().length < 2) return "Gym name must be at least 2 characters";
    if (value.length > 120) return "Gym name must be at most 120 characters";
    return null;
  },
  tenantSlug: (value: string): string | null => {
    if (!value || value.length < 2) return "Slug must be at least 2 characters";
    if (value.length > 60) return "Slug must be at most 60 characters";
    if (!SLUG_REGEX.test(value)) return "Slug must be lowercase alphanumeric with hyphens only";
    return null;
  },
  tenantEmail: (value: string): string | null => {
    if (!value) return null; // Optional
    if (!EMAIL_REGEX.test(value)) return "Invalid gym email format";
    if (value.length > 254) return "Email is too long";
    return null;
  },
  tenantPhone: (value: string): string | null => {
    if (!value) return null; // Optional
    if (value.length < 6) return "Phone must be at least 6 characters";
    if (value.length > 20) return "Phone must be at most 20 characters";
    return null;
  },
  tenantAddress: (value: string): string | null => {
    if (!value) return null; // Optional
    if (value.length > 500) return "Address must be at most 500 characters";
    return null;
  },
  adminName: (value: string): string | null => {
    if (!value || value.trim().length < 2) return "Admin name must be at least 2 characters";
    if (value.length > 120) return "Admin name must be at most 120 characters";
    return null;
  },
  adminEmail: (value: string): string | null => {
    if (!value) return "Admin email is required";
    if (!EMAIL_REGEX.test(value)) return "Invalid admin email format";
    if (value.length > 254) return "Email is too long";
    return null;
  },
  adminPhone: (value: string): string | null => {
    if (!value) return null; // Optional
    if (value.length < 10) return "Phone must be at least 10 characters";
    if (value.length > 15) return "Phone must be at most 15 characters";
    return null;
  },
  adminPassword: (_value: string): string | null => {
    return null;
  },
};

function normalizeSlugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewTenant() {
  const navigate = useNavigate();

  const [tenantName, setTenantName] = React.useState("");
  const [tenantSlug, setTenantSlug] = React.useState("");
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [tenantEmail, setTenantEmail] = React.useState("");
  const [tenantPhone, setTenantPhone] = React.useState("");
  const [tenantAddress, setTenantAddress] = React.useState("");
  const [tenantMarkdown, setTenantMarkdown] = React.useState("");

  const [adminName, setAdminName] = React.useState("");
  const [adminEmail, setAdminEmail] = React.useState("");
  const [adminPhone, setAdminPhone] = React.useState("");

  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);
  const [createdTenantName, setCreatedTenantName] = React.useState("");
  const [generatedPassword, setGeneratedPassword] = React.useState("");

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const resetForm = React.useCallback(() => {
    setTenantName("");
    setTenantSlug("");
    setSlugEdited(false);
    setTenantEmail("");
    setTenantPhone("");
    setTenantAddress("");
    setTenantMarkdown("");
    setAdminName("");
    setAdminEmail("");
    setAdminPhone("");
    setLogoFile(null);
    setLogoPreview(null);
    setAvatarFile(null);
    setAvatarPreview(null);
    setError("");
    setFieldErrors({});
  }, []);

  React.useEffect(() => {
    if (slugEdited) return;
    setTenantSlug(toSlug(tenantName));
  }, [tenantName, slugEdited]);

  const isValidUrl = (url: string | undefined | null): url is string => {
    if (!url || typeof url !== "string") return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const finalSlug = normalizeSlugInput(tenantSlug || toSlug(tenantName));

    // Tenant field validation
    const tenantNameError = validators.tenantName(tenantName);
    if (tenantNameError) newErrors.tenant_name = tenantNameError;

    const tenantSlugError = validators.tenantSlug(finalSlug);
    if (tenantSlugError) newErrors.tenant_slug = tenantSlugError;

    const tenantEmailError = validators.tenantEmail(tenantEmail);
    if (tenantEmailError) newErrors.tenant_email = tenantEmailError;

    const tenantPhoneError = validators.tenantPhone(tenantPhone);
    if (tenantPhoneError) newErrors.tenant_phone = tenantPhoneError;

    const tenantAddressError = validators.tenantAddress(tenantAddress);
    if (tenantAddressError) newErrors.tenant_address = tenantAddressError;

    // Admin field validation
    const adminNameError = validators.adminName(adminName);
    if (adminNameError) newErrors.admin_name = adminNameError;

    const adminEmailError = validators.adminEmail(adminEmail);
    if (adminEmailError) newErrors.admin_email = adminEmailError;

    const adminPhoneError = validators.adminPhone(adminPhone);
    if (adminPhoneError) newErrors.admin_phone = adminPhoneError;

    setFieldErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate all fields
    if (!validateForm()) {
      setError("Please fix the validation errors below.");
      return;
    }

    setSubmitting(true);
    try {
      let logoUrl: string | undefined;
      let avatarUrl: string | undefined;

      // Upload logo if provided
      if (logoFile) {
        try {
          const uploadLogoRes = await uploadsApi.uploadLogo(logoFile);
          const uploadedLogoUrl = uploadLogoRes?.data?.data?.url;
          if (isValidUrl(uploadedLogoUrl)) {
            logoUrl = uploadedLogoUrl;
          } else {
            throw new Error("Invalid logo URL returned from server");
          }
        } catch (err) {
          setError("Failed to upload logo image. Please ensure it's a valid image file.");
          setSubmitting(false);
          return;
        }
      }

      // Upload avatar if provided
      if (avatarFile) {
        try {
          const uploadAvatarRes = await uploadsApi.uploadAvatar(avatarFile);
          const uploadedAvatarUrl = uploadAvatarRes?.data?.data?.url;
          if (isValidUrl(uploadedAvatarUrl)) {
            avatarUrl = uploadedAvatarUrl;
          } else {
            throw new Error("Invalid avatar URL returned from server");
          }
        } catch (err) {
          setError("Failed to upload admin avatar. Please ensure it's a valid image file.");
          setSubmitting(false);
          return;
        }
      }

      const payload: CreateTenantPayload = {
        name: tenantName.trim(),
        slug: normalizeSlugInput(tenantSlug || toSlug(tenantName)),
        ...(tenantEmail.trim() ? { email: tenantEmail.trim() } : {}),
        ...(tenantPhone.trim() ? { phone: tenantPhone.trim() } : {}),
        ...(tenantAddress.trim() ? { address: tenantAddress.trim() } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        ...(tenantMarkdown.trim() ? { markdown: tenantMarkdown.trim() } : {}),
        admin: {
          name: adminName.trim(),
          email: adminEmail.trim(),
          ...(adminPhone.trim() ? { phone: adminPhone.trim() } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
        },
      };

      const res = await tenantsApi.create(payload);
      setCreatedTenantName(payload.name);
      setGeneratedPassword(res.data.data.generatedPassword ?? "");
      setSuccess(true);
      resetForm();
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError || "Failed to create tenant. Please check the form and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-7 w-7 text-green-600" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold">Tenant Created</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {createdTenantName} was created with its admin account.
            </p>
          </div>
          {generatedPassword && (
            <div className="w-full max-w-sm rounded-lg border bg-muted px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Admin Password</p>
              <p className="font-mono text-lg font-semibold select-all">{generatedPassword}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Share this password with the admin. They can change it after logging in.
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate("/tenants")}>
              Back to Tenants
            </Button>
            <Button onClick={() => setSuccess(false)}>
              <Building2 className="mr-2 h-4 w-4" />
              Create Another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Tenant</h1>
        <p className="text-muted-foreground">
          Create a gym tenant, assign an admin, and upload logo/avatar in one flow.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant and Admin Setup</CardTitle>
          <CardDescription>
            A random password will be generated for the admin. You'll see it after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">Tenant Details</h2>

              <div className="space-y-2">
                <Label htmlFor="tenant-name">Gym Name</Label>
                <Input
                  id="tenant-name"
                  placeholder="Iron Works Gym"
                  required
                  minLength={2}
                  maxLength={120}
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  disabled={submitting}
                  autoFocus
                  className={
                    fieldErrors.tenant_name ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.tenant_name && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.tenant_name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenant-slug">Slug</Label>
                <Input
                  id="tenant-slug"
                  placeholder="iron-works-gym"
                  required
                  minLength={2}
                  maxLength={60}
                  value={tenantSlug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setTenantSlug(normalizeSlugInput(e.target.value));
                  }}
                  disabled={submitting}
                  className={
                    fieldErrors.tenant_slug ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.tenant_slug && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.tenant_slug}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Used in gym public URL.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenant-email">Email (optional)</Label>
                <Input
                  id="tenant-email"
                  type="email"
                  placeholder="info@gym.com"
                  value={tenantEmail}
                  onChange={(e) => setTenantEmail(e.target.value)}
                  disabled={submitting}
                  className={
                    fieldErrors.tenant_email ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.tenant_email && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.tenant_email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenant-phone">Phone (optional)</Label>
                <Input
                  id="tenant-phone"
                  placeholder="+91 98765 43210"
                  value={tenantPhone}
                  onChange={(e) => setTenantPhone(e.target.value)}
                  disabled={submitting}
                  className={
                    fieldErrors.tenant_phone ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.tenant_phone && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.tenant_phone}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tenant-address">Address (optional)</Label>
                <Input
                  id="tenant-address"
                  placeholder="123 Gym Street"
                  value={tenantAddress}
                  onChange={(e) => setTenantAddress(e.target.value)}
                  disabled={submitting}
                  className={
                    fieldErrors.tenant_address ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.tenant_address && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.tenant_address}
                  </p>
                )}
              </div>

              <div>
                <MarkdownEditor
                  id="tenant-markdown"
                  label="Description (Markdown, optional)"
                  placeholder={
                    "Write a description using Markdown...\n\n## About Our Gym\n\nWelcome to our gym!\n\n### Facilities\n- Cardio zone\n- Weight room"
                  }
                  value={tenantMarkdown}
                  onChange={setTenantMarkdown}
                  disabled={submitting}
                  rows={8}
                  hint="Supports headings, lists, tables, bold, italic, and more."
                />
              </div>

              <div className="space-y-2">
                <Label>Tenant Logo (optional)</Label>
                <PhotoCapture
                  value={logoPreview}
                  onChange={(file, preview) => {
                    setLogoFile(file);
                    setLogoPreview(preview);
                  }}
                  requireFace={false}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-4 border-t pt-6">
              <h2 className="text-sm font-semibold text-muted-foreground">Admin Details</h2>

              <div className="space-y-2">
                <Label htmlFor="admin-name">Admin Name</Label>
                <Input
                  id="admin-name"
                  placeholder="John Doe"
                  required
                  minLength={2}
                  maxLength={120}
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  disabled={submitting}
                  className={
                    fieldErrors.admin_name ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.admin_name && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.admin_name}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-email">Admin Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@gym.com"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  disabled={submitting}
                  className={
                    fieldErrors.admin_email ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.admin_email && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.admin_email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-phone">Admin Phone (optional)</Label>
                <Input
                  id="admin-phone"
                  type="tel"
                  placeholder="9876543210"
                  minLength={10}
                  maxLength={15}
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  disabled={submitting}
                  className={
                    fieldErrors.admin_phone ? "border-red-500 focus-visible:ring-red-500" : ""
                  }
                />
                {fieldErrors.admin_phone && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {fieldErrors.admin_phone}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Admin Avatar (optional)</Label>
                <PhotoCapture
                  value={avatarPreview}
                  onChange={(file, preview) => {
                    setAvatarFile(file);
                    setAvatarPreview(preview);
                  }}
                  disabled={submitting}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate("/tenants")}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Tenant"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
