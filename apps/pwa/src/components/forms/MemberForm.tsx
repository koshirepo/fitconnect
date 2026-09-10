import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import MemberSelector from "@/components/ui/memberSelector";
import { PhotoCapture } from "@/components/ui/photo-capture";
import { useTenantRoleMatrix } from "@/api/queries/roles";
import { useAuthStore } from "@/stores/auth";
import { formatShiftLabel } from "@/lib/shifts";
import { AlertCircle, CircleSlash, Clock } from "lucide-react";
import type { Gender, OccupationSummary, Shift, TenantMember } from "@/types/api";
import { DEFAULT_GENDER, GENDER_OPTIONS } from "@/lib/gender";
import { useOccupations } from "@/api/queries/occupations";
import { DEFAULT_OCCUPATION_NAME } from "@/lib/occupation";
import { OccupationSelect } from "@/components/ui/occupation-select";

/**
 * One selectable chip. Chips are used wherever the choices are few and worth
 * seeing at a glance — gender, shift — instead of hiding them behind a select.
 */
function ChipOption({
  icon: Icon,
  label,
  selected,
  disabled,
  onSelect,
}: {
  icon: React.ElementType;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        selected
          ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
          : "border-border text-muted-foreground hover:bg-accent/50"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export interface MemberFormData {
  name: string;
  email: string;
  phone: string;
  gender: Gender;
  /** "1998-04-23", as the date input holds it. Required. */
  dateOfBirth: string;
  /** A row id from the platform-wide occupation list, or "" for none. */
  occupationId: string;
  /** Built-in (MEMBER/COACH/ADMIN) or a custom role key. */
  role: string;
  shiftId: string;
  referredByMembershipId: string;
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
  referralOptions?: TenantMember[];
  loadingShifts?: boolean;
  /**
   * A photo is mandatory for everyone except an admin, who can add a member
   * from the desk now and fill the photo in later.
   */
  requirePhoto?: boolean;
  /**
   * Show the phone as read-only, for staff who may not see a member's number.
   * `initialData.phone` is expected to already be masked; the field is disabled
   * so the masked text can never be saved over the real number.
   */
  phoneReadOnly?: boolean;
  /**
   * The occupation list, for callers that already hold it.
   *
   * The public join form is the reason this exists: a visitor has no session,
   * so `/occupations` would refuse them, and their list arrives with the rest
   * of the signup options instead. Left unset, the form fetches it itself.
   */
  occupationOptions?: OccupationSummary[];
  /**
   * What this member's occupation is now, when they already have one.
   *
   * The picker offers only occupations still being offered, so a member
   * holding one the platform has since retired would open the form showing
   * "Choose an occupation…" — as if the field were empty. Passing the row
   * keeps it visible and selected; it is never offered to anybody else.
   */
  currentOccupation?: OccupationSummary | null;
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
  referralOptions,
  loadingShifts = false,
  requirePhoto = false,
  phoneReadOnly = false,
  occupationOptions,
  currentOccupation,
  onSubmit,
  onCancel,
  submitLabel,
}: MemberFormProps) {
  const { can } = usePermissions();
  const { currentTenantId } = useAuthStore();
  // Assigning a role to another member is its own capability.
  const canAssignRoles = can(Permission.MEMBERS_ROLE_UPDATE);

  // Built-in tenant roles plus any custom roles the gym has defined. Only the
  // ADMIN/COACH/MEMBER built-ins and custom roles are assignable; SUPER_ADMIN
  // never appears in a tenant matrix.
  const matrixQuery = useTenantRoleMatrix(currentTenantId);
  const roleOptions = React.useMemo(() => {
    const rows = matrixQuery.data?.roles ?? [];
    return rows.map((entry) => ({
      value: entry.role,
      label: entry.label,
      description: entry.description ?? "",
    }));
  }, [matrixQuery.data]);

  // Form state
  const [name, setName] = React.useState(initialData.name ?? "");
  const [email, setEmail] = React.useState(initialData.email ?? "");
  const [phone, setPhone] = React.useState(initialData.phone ?? "");
  const [gender, setGender] = React.useState<Gender>(initialData.gender ?? DEFAULT_GENDER);
  const [dateOfBirth, setDateOfBirth] = React.useState(initialData.dateOfBirth ?? "");
  // Null means "not chosen yet", which is what lets a new member fall back to
  // the default below; "" is somebody having deliberately cleared the field.
  const [occupationId, setOccupationId] = React.useState<string | null>(
    initialData.occupationId ?? null,
  );
  const [role, setRole] = React.useState<string>(initialData.role ?? "MEMBER");
  const [shiftId, setShiftId] = React.useState(initialData.shiftId ?? "");
  const [referredByMembershipId, setReferredByMembershipId] = React.useState(
    initialData.referredByMembershipId ?? "",
  );
  const [photoFile, setPhotoFile] = React.useState<File | null>(initialData.photoFile ?? null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(
    initialData.photoPreview ?? null,
  );
  const [internalError, setInternalError] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // The platform's occupation list, and the chip a new member starts on.
  const occupationsQuery = useOccupations({ enabled: occupationOptions === undefined });
  const offered = occupationOptions ?? occupationsQuery.data ?? [];
  const occupations =
    currentOccupation && !offered.some((option) => option.id === currentOccupation.id)
      ? [...offered, currentOccupation]
      : offered;

  /**
   * A new member starts as a student, which is what most of them are.
   *
   * Derived rather than written into state on arrival: the field holds a row
   * id, the list arrives after the first render, and an effect that filled the
   * state in would then have to be careful not to undo somebody clearing it.
   */
  const defaultOccupationId =
    mode === "create"
      ? (occupations.find((option) => option.name === DEFAULT_OCCUPATION_NAME)?.id ?? "")
      : "";
  const selectedOccupationId = occupationId ?? defaultOccupationId;

  /** Nobody was born tomorrow. */
  const today = new Date().toISOString().slice(0, 10);

  const selectedReferrer =
    referralOptions?.find((member) => member.id === referredByMembershipId) ?? null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalError("");

    // On edit the existing avatar is already on file, so only a new record has
    // to produce one here.
    if (requirePhoto && mode === "create" && !photoFile && !photoPreview) {
      setInternalError("A photo is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        email,
        phone,
        gender,
        dateOfBirth,
        occupationId: selectedOccupationId,
        role,
        shiftId,
        referredByMembershipId,
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
        <Label>
          Photo
          {requirePhoto && <span className="ml-1 text-destructive">*</span>}
        </Label>
        <PhotoCapture
          value={photoPreview}
          onChange={(file, preview) => {
            setPhotoFile(file);
            setPhotoPreview(preview);
            if (preview) setInternalError("");
          }}
          disabled={isSubmitting || submitting}
        />
        {requirePhoto && (
          <p className="text-xs text-muted-foreground">
            Take or upload a photo — it's how the gym recognises you at the door.
          </p>
        )}
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
        <PhoneInput
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="9876543210"
          required={!phoneReadOnly}
          minLength={phoneReadOnly ? undefined : 10}
          maxLength={15}
          disabled={phoneReadOnly || isSubmitting || submitting}
        />
        {phoneReadOnly && (
          <p className="text-xs text-muted-foreground">
            Hidden on your role. Everything else about this member still saves.
          </p>
        )}
      </div>

      {/* Gender — chips that behave as one radio group. */}
      <div className="space-y-2">
        <Label>Gender</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Gender">
          {GENDER_OPTIONS.map((option) => (
            <ChipOption
              key={option.value}
              icon={option.icon}
              label={option.label}
              selected={gender === option.value}
              disabled={isSubmitting || submitting}
              onSelect={() => setGender(option.value)}
            />
          ))}
        </div>
      </div>

      {/* Date of birth. Required — a record without one is a member the gym
          has to chase later — and capped at today, because nobody joins a gym
          before they are born. */}
      <div className="space-y-2">
        <Label htmlFor="date-of-birth">Date of Birth</Label>
        <Input
          id="date-of-birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          required
          max={today}
          disabled={isSubmitting || submitting}
        />
      </div>

{/* Occupation — a searchable list rather than chips, because the platform
          list is open-ended and a gym with twenty of them would push the rest
          of the admission form off the screen. Hidden entirely while the list
          is loading or empty, rather than showing a heading over nothing. */}
      {occupations.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="occupation">Occupation</Label>
          <OccupationSelect
            id="occupation"
            options={occupations}
            value={selectedOccupationId}
            onChange={setOccupationId}
            disabled={isSubmitting || submitting}
          />
        </div>
      )}

      {mode === "create" && referralOptions !== undefined && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="referrer">Referred By</Label>
            {selectedReferrer && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setReferredByMembershipId("")}
                disabled={isSubmitting || submitting}
              >
                Clear
              </Button>
            )}
          </div>
          <MemberSelector
            members={referralOptions}
            selectedMember={selectedReferrer}
            onSelect={(member) => setReferredByMembershipId(member.id)}
            placeholder="Choose referring member (optional)"
            title="Select Referring Member"
            description="Pick the member who referred this new joiner."
          />
          <p className="text-xs text-muted-foreground">
            Optional. This is used for referral tracking and influence ranking.
          </p>
        </div>
      )}

      {/* Shift — the same chip radio group as gender, with "no shift" as a chip
          of its own since the field is optional. */}
      {shiftOptions !== undefined && (
        <div className="space-y-2">
          <Label>Shift</Label>
          {loadingShifts ? (
            <p className="text-sm text-muted-foreground">Loading shifts...</p>
          ) : shiftOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts configured.</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Shift">
              <ChipOption
                icon={CircleSlash}
                label="No shift"
                selected={shiftId === ""}
                disabled={isSubmitting || submitting}
                onSelect={() => setShiftId("")}
              />
              {shiftOptions.map((shift) => (
                <ChipOption
                  key={shift.id}
                  icon={Clock}
                  label={`${formatShiftLabel(shift)}${shift.isActive ? "" : " - Inactive"}`}
                  selected={shiftId === shift.id}
                  disabled={isSubmitting || submitting}
                  onSelect={() => setShiftId(shift.id)}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Assign the member to a gym shift or batch.
          </p>
        </div>
      )}

      {/* Role Selection */}
      {canAssignRoles && (
        <div className="space-y-3">
          <Label>Role</Label>
          {matrixQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading roles...</p>
          ) : (
            <div className="grid gap-3">
              {roleOptions.map((opt) => (
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
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
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
            : submitLabel || (mode === "create" ? "Add Member" : "Save Changes")}
        </Button>
      </div>
    </form>
  );
}
