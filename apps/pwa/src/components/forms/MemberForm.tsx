import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PhotoCapture } from "@/components/ui/photo-capture";
import { formatShiftLabel } from "@/lib/shifts";
import { AlertCircle } from "lucide-react";
import type { Shift, TenantRole } from "@/types/api";

// ─── Role options per caller role ─────────────────────────────────────────────
const ROLE_OPTIONS: Record<
  string,
  { value: TenantRole; label: string; description: string }[]
> = {
  ADMIN: [
    {
      value: "MEMBER",
      label: "Member",
      description:
        "Can view schedules, enroll in classes, and manage their own profile",
    },
    {
      value: "COACH",
      label: "Trainer / Coach",
      description:
        "Can manage workout plans, view members, and add new members",
    },
    {
      value: "ADMIN",
      label: "Admin",
      description:
        "Full management access including members, billing, and settings",
    },
  ],
  COACH: [
    {
      value: "MEMBER",
      label: "Member",
      description:
        "Can view schedules, enroll in classes, and manage their own profile",
    },
  ],
};

export interface MemberFormData {
  name: string;
  email: string;
  phone: string;
  role: TenantRole;
  shiftId: string;
  photoFile: File | null;
  photoPreview: string | null;
}

interface MemberFormProps {
  mode: "create" | "edit";
  initialData?: Partial<MemberFormData>;
  submitting?: boolean;
  error?: string;
  tenantId?: string;
  shiftOptions?: Shift[];
  loadingShifts?: boolean;
  onSubmit: (data: MemberFormData) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

export default function MemberForm({
  mode,
  initialData = {},
  submitting = false,
  error = "",
  shiftOptions,
  loadingShifts = false,
  onSubmit,
  onCancel,
  submitLabel,
}: MemberFormProps) {
  const { tenantRole} = useAuthStore();
  const callerRole = tenantRole() ?? "";

  // Form state
  const [name, setName] = React.useState(initialData.name ?? "");
  const [email, setEmail] = React.useState(initialData.email ?? "");
  const [phone, setPhone] = React.useState(initialData.phone ?? "");
  const [role, setRole] = React.useState<TenantRole>(
    initialData.role ?? ("MEMBER" as TenantRole),
  );
  const [shiftId, setShiftId] = React.useState(initialData.shiftId ?? "");
  const [photoFile, setPhotoFile] = React.useState<File | null>(
    initialData.photoFile ?? null,
  );
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(
    initialData.photoPreview ?? null,
  );
  const [internalError, setInternalError] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const availableRoles = ROLE_OPTIONS[callerRole] ?? ROLE_OPTIONS.COACH;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalError("");

    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        email,
        phone,
        role,
        shiftId,
        photoFile,
        photoPreview,
      });
    } catch (err) {
      setInternalError(getApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = internalError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Photo */}
      <div className="space-y-2">
        <Label>Photo</Label>
        <PhotoCapture
          value={photoPreview}
          onChange={(file, preview) => {
            setPhotoFile(file);
            setPhotoPreview(preview);
          }}
          disabled={isSubmitting || submitting}
        />
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Full Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          required
          minLength={2}
          maxLength={120}
          autoFocus
          disabled={isSubmitting || submitting}
        />
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">Email Address (Optional)</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="john@example.com"
          disabled={mode === "edit" || isSubmitting || submitting}
        />
        <p className="text-xs text-muted-foreground">
          {mode === "create"
            ? "This will be used as their login email."
            : "Email cannot be changed after creation."}
        </p>
      </div>

      {/* Phone */}
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="9876543210"
          required
          minLength={10}
          maxLength={15}
          disabled={isSubmitting || submitting}
        />
      </div>

      {shiftOptions !== undefined && (
        <div className="space-y-2">
          <Label htmlFor="shiftId">Shift</Label>
          <Select
            id="shiftId"
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            disabled={
              isSubmitting ||
              submitting ||
              loadingShifts ||
              shiftOptions.length === 0
            }
          >
            <option value="">
              {loadingShifts
                ? "Loading shifts..."
                : shiftOptions.length === 0
                  ? "No shifts configured"
                  : "Choose a shift (optional)"}
            </option>
            {shiftOptions.map((shift) => (
              <option key={shift.id} value={shift.id}>
                {formatShiftLabel(shift)}
                {!shift.isActive ? " - Inactive" : ""}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Assign the member to a gym shift or batch.
          </p>
        </div>
      )}

      {/* Role Selection */}
      {callerRole === "ADMIN" && (
        <div className="space-y-3">
          <Label>Role</Label>
          <div className="grid gap-3">
            {availableRoles.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50 ${
                  role === opt.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={opt.value}
                  checked={role === opt.value}
                  onChange={() => setRole(opt.value)}
                  className="mt-0.5"
                  disabled={isSubmitting || submitting}
                />
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {opt.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {displayError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {displayError}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting || submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || submitting}>
          {isSubmitting || submitting
            ? mode === "create"
              ? "Adding..."
              : "Saving..."
            : submitLabel ||
              (mode === "create" ? "Add Member" : "Save Changes")}
        </Button>
      </div>
    </form>
  );
}
