import * as React from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { tenantsApi } from "@/api/tenants";
import { settingsApi } from "@/api/settings";
import { uploadsApi } from "@/api/uploads";
import { badgesApi } from "@/api/badges";
import { attendanceApi } from "@/api/attendance";
import { shiftsApi } from "@/api/shifts";
import { getApiError } from "@/api/client";
import { formatDate, getInitials } from "@/shared";
import { getDueDateState } from "@/lib/member-due";
import { formatShiftLabel, formatShiftWindow } from "@/lib/shifts";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { resolveAssetUrl } from "@/lib/assets";
import {
  getTenantWhatsAppTemplateBody,
  renderWhatsAppTemplateBody,
} from "@/lib/whatsapp-templates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Shield,
  Award,
  Dumbbell,
  Clock,
  CreditCard,
  Mail,
  Phone,
  Calendar,
  Edit,
  PlusCircle,
  Plus,
  X,
  PhoneCall,
  MessageCircle,
  UserCheck,
  UserX,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Trash2,
} from "lucide-react";
import type { Badge, MemberDetail, Shift, TenantSettings } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";
import MemberForm, { type MemberFormData } from "@/components/forms/MemberForm";

const PAYMENT_AMOUNT_COLOR: Record<string, string> = {
  PENDING: "text-yellow-600",
  COMPLETED: "text-green-600",
  FAILED: "text-red-600",
  REFUNDED: "text-muted-foreground",
};

const fmt = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(s: string): Date {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function formatMonthLabel(s: string) {
  const d = parseMonth(s);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default function MemberDetailPage() {
  const { membershipId } = useParams<{ membershipId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentTenantId, tenantRole, currentMembership } = useAuthStore();
  const role = tenantRole();
  const gymName = currentMembership()?.tenantName ?? "the gym";
  const canManageBadges = role === "ADMIN" || role === "COACH";

  const isEditMode = location.pathname.endsWith("/edit");

  const [member, setMember] = React.useState<MemberDetail | null>(null);
  const [tenantSettings, setTenantSettings] = React.useState<TenantSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [editSubmitting, setEditSubmitting] = React.useState(false);
  const [editError, setEditError] = React.useState("");
  const [shiftOptions, setShiftOptions] = React.useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = React.useState(false);

  const [availableBadges, setAvailableBadges] = React.useState<Badge[]>([]);
  const [loadingBadges, setLoadingBadges] = React.useState(false);
  const [selectedBadgeId, setSelectedBadgeId] = React.useState("");
  const [badgeError, setBadgeError] = React.useState("");

  const [showBadgePicker, setShowBadgePicker] = React.useState(false);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deletingMember, setDeletingMember] = React.useState(false);
  const paymentsSectionRef = React.useRef<HTMLDivElement>(null);
  const isMemberProfile = member?.role === "MEMBER";

  const loadMember = React.useCallback(
    async (showLoading = true) => {
      if (!currentTenantId || !membershipId) return;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const res = await tenantsApi.getMemberDetail(currentTenantId, membershipId);
        setMember(res.data.data.member);
      } catch (err: unknown) {
        setMember(null);
        setError(getApiError(err));
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [currentTenantId, membershipId],
  );

  const loadBadges = React.useCallback(async () => {
    if (!currentTenantId || !canManageBadges) return;
    setLoadingBadges(true);
    try {
      const res = await badgesApi.list(currentTenantId, 1, 100, false);
      setAvailableBadges(res.data.data);
    } catch {
      setAvailableBadges([]);
    } finally {
      setLoadingBadges(false);
    }
  }, [currentTenantId, canManageBadges]);

  React.useEffect(() => {
    void loadMember(true);
  }, [loadMember]);

  React.useEffect(() => {
    if (!canManageBadges) return;
    void loadBadges();
  }, [canManageBadges, loadBadges]);

  React.useEffect(() => {
    if (!currentTenantId) return;
    settingsApi
      .getSettings(currentTenantId)
      .then((res) => setTenantSettings(res.data.data.settings))
      .catch(() => setTenantSettings(null));
  }, [currentTenantId]);

  const loadShifts = React.useCallback(async () => {
    if (!currentTenantId) return;
    setLoadingShifts(true);
    try {
      const res = await shiftsApi.list(currentTenantId, 1, 100, true);
      setShiftOptions(res.data.data.shifts);
    } catch {
      setShiftOptions([]);
    } finally {
      setLoadingShifts(false);
    }
  }, [currentTenantId]);

  React.useEffect(() => {
    if (!isEditMode) return;
    void loadShifts();
  }, [isEditMode, loadShifts]);

  // Scroll to hash target (e.g. #attendance) once data is loaded
  React.useEffect(() => {
    if (loading || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, location.hash]);

  // ─── Attendance calendar ────────────────────────────────────────────────────
  const today = new Date();
  const [calMonth, setCalMonth] = React.useState(getMonthStr(today));
  const [calDates, setCalDates] = React.useState<Set<string>>(new Set());
  const [calTotal, setCalTotal] = React.useState(0);
  const [calLoading, setCalLoading] = React.useState(false);

  const navigateMonth = (dir: -1 | 1) => {
    const d = parseMonth(calMonth);
    d.setMonth(d.getMonth() + dir);
    setCalMonth(getMonthStr(d));
  };

  React.useEffect(() => {
    if (!currentTenantId || !membershipId || !isMemberProfile) {
      setCalDates(new Set());
      setCalTotal(0);
      setCalLoading(false);
      return;
    }
    let cancelled = false;
    setCalLoading(true);
    attendanceApi
      .memberCalendar(currentTenantId, membershipId, calMonth)
      .then((res) => {
        if (cancelled) return;
        setCalDates(new Set(res.data.data.dates));
        setCalTotal(res.data.data.total);
      })
      .catch(() => {
        if (!cancelled) setCalDates(new Set());
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTenantId, membershipId, calMonth, isMemberProfile]);

  const handleToggleStatus = async () => {
    if (!currentTenantId || !membershipId || !member) return;
    const newStatus = member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setStatusLoading(true);
    // Optimistic
    setMember((prev) => (prev ? { ...prev, status: newStatus } : prev));
    try {
      await tenantsApi.updateMemberStatus(currentTenantId, membershipId, newStatus);
    } catch (err: unknown) {
      setMember((prev) => (prev ? { ...prev, status: member.status } : prev));
      setError(getApiError(err));
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!currentTenantId || !membershipId) return;

    setDeletingMember(true);
    setError("");
    try {
      await tenantsApi.removeMember(currentTenantId, membershipId);
      navigate("/members", { replace: true });
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setDeletingMember(false);
    }
  };

  const handleEditSubmit = async (data: MemberFormData) => {
    setEditError("");
    if (!currentTenantId || !membershipId || !member) return;

    setEditSubmitting(true);
    try {
      const roleChanged = data.role !== member.role;
      const nameChanged = data.name !== member.name;
      const phoneChanged = data.phone !== (member.phone ?? "");
      const nextShiftId = data.shiftId || null;
      const currentShiftId = member.shift?.id ?? null;
      const shiftChanged = nextShiftId !== currentShiftId;
      const avatarChanged = Boolean(data.photoFile) || data.photoPreview !== member.avatarUrl;

      if (!roleChanged && !nameChanged && !phoneChanged && !shiftChanged && !avatarChanged) {
        navigate(`/members/${membershipId}`, { replace: true });
        return;
      }

      let avatarUrl: string | null | undefined;
      if (data.photoFile) {
        const uploadRes = await uploadsApi.uploadAvatar(data.photoFile);
        avatarUrl = uploadRes.data.data.url;
      } else if (data.photoPreview !== member.avatarUrl) {
        avatarUrl = data.photoPreview ?? null;
      }

      if (roleChanged) {
        await tenantsApi.updateMemberRole(currentTenantId, membershipId, data.role);
      }

      if (nameChanged || phoneChanged || shiftChanged || avatarUrl !== undefined) {
        await tenantsApi.updateMember(currentTenantId, membershipId, {
          ...(nameChanged ? { name: data.name } : {}),
          ...(phoneChanged ? { phone: data.phone } : {}),
          ...(shiftChanged ? { shiftId: nextShiftId } : {}),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        });
      }

      await loadMember(false);
      navigate(`/members/${membershipId}`, { replace: true });
    } catch (err: unknown) {
      setEditError(getApiError(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const assignableBadges = React.useMemo(() => {
    const assignedIds = new Set(member?.badges.map((b) => b.id) ?? []);
    return availableBadges.filter((badge) => badge.isActive && !assignedIds.has(badge.id));
  }, [availableBadges, member?.badges]);

  const handleAssignBadge = async () => {
    if (!currentTenantId || !membershipId || !selectedBadgeId) return;

    const badge = availableBadges.find((b) => b.id === selectedBadgeId);
    if (!badge) return;

    setBadgeError("");

    // Optimistic update — badge appears instantly, picker stays open for more
    setMember((prev) => (prev ? { ...prev, badges: [...prev.badges, badge] } : prev));
    setSelectedBadgeId("");

    try {
      await badgesApi.assign(currentTenantId, badge.id, { membershipId });
    } catch (err: unknown) {
      // Revert on failure
      setMember((prev) =>
        prev ? { ...prev, badges: prev.badges.filter((b) => b.id !== badge.id) } : prev,
      );
      setSelectedBadgeId(badge.id);
      setBadgeError(getApiError(err));
    }
  };

  const handleRemoveBadge = async (badgeId: string) => {
    if (!currentTenantId || !membershipId) return;

    const badge = member?.badges.find((b) => b.id === badgeId);
    if (!badge) return;

    setBadgeError("");

    // Optimistic update — badge disappears instantly
    setMember((prev) =>
      prev ? { ...prev, badges: prev.badges.filter((b) => b.id !== badgeId) } : prev,
    );

    try {
      await badgesApi.unassign(currentTenantId, badgeId, membershipId);
    } catch (err: unknown) {
      // Revert on failure
      setMember((prev) => (prev ? { ...prev, badges: [...prev.badges, badge] } : prev));
      setBadgeError(getApiError(err));
    }
  };

  // ─── Payment due detection ──────────────────────────────────────────────────
  const isDue = React.useMemo(() => {
    if (!member || member.status !== "ACTIVE" || !isMemberProfile) return false;
    const hasSubscriptionPayment = member.payments.some((p) => p.validUntil);
    if (!hasSubscriptionPayment) return false;
    const now = new Date();
    return !member.payments.some((p) => p.validUntil && new Date(p.validUntil) > now);
  }, [member, isMemberProfile]);

  const lastExpiry = React.useMemo(() => {
    if (!isDue || !member) return null;
    const dates = member.payments.filter((p) => p.validUntil).map((p) => new Date(p.validUntil!));
    return dates.length
      ? formatDate(new Date(Math.max(...dates.map((d) => d.getTime()))).toISOString())
      : null;
  }, [isDue, member]);

  const paymentReminderTemplateBody = React.useMemo(
    () => getTenantWhatsAppTemplateBody(tenantSettings, "payment_reminder"),
    [tenantSettings],
  );

  const paymentReminderUrl = React.useMemo(() => {
    if (!isMemberProfile || !isDue || !member?.phone) return null;
    const text = renderWhatsAppTemplateBody(paymentReminderTemplateBody, {
      memberName: member.name,
      gymName,
      expirySuffix: lastExpiry ? ` on ${lastExpiry}` : "",
    });
    return buildWhatsAppUrl(member.phone, text);
  }, [isDue, isMemberProfile, member, paymentReminderTemplateBody, gymName, lastExpiry]);

  if (loading) return <PageLoader />;

  if (!member) {
    const isNotFound = error.toLowerCase().includes("not found");
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Shield}
          title={isNotFound ? "Member not found" : "Unable to load member"}
          description={error || "Could not load this member right now."}
          action={
            <Button variant="outline" onClick={() => void loadMember(true)}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (isEditMode) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Edit Member</CardTitle>
            <CardDescription>Update member information</CardDescription>
          </CardHeader>
          <CardContent>
            <MemberForm
              mode="edit"
              error={editError}
              submitting={editSubmitting}
              initialData={{
                name: member.name,
                email: member.email,
                phone: member.phone ?? "",
                role: member.role,
                shiftId: member.shift?.id ?? "",
                photoPreview: member.avatarUrl,
              }}
              shiftOptions={shiftOptions}
              loadingShifts={loadingShifts}
              onSubmit={handleEditSubmit}
              onCancel={() => navigate(`/members/${membershipId}`)}
              submitLabel="Save Changes"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Shared meta + badges (used in both mobile and desktop layouts) ──────────
  const memberMeta = (
    <>
      <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Mail className="h-3.5 w-3.5" />
          {member.email}
        </span>
        {member.phone && (
          <span className="flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" />
            {member.phone}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          Joined {formatDate(member.joinedAt)}
        </span>
        {member.shift && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatShiftLabel(member.shift)}
          </span>
        )}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {member.badges.map((badge) => (
          <span
            key={badge.id}
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
          >
            <span
              className="h-4 w-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
              style={{ backgroundColor: badge.color }}
            >
              {(badge.icon ?? badge.name).charAt(0).toUpperCase()}
            </span>
            {badge.name}
            {canManageBadges && (
              <button
                type="button"
                onClick={() => handleRemoveBadge(badge.id)}
                className="ml-0.5 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                title="Remove badge"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {canManageBadges && assignableBadges.length > 0 && !showBadgePicker && (
          <button
            type="button"
            onClick={() => setShowBadgePicker(true)}
            className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            title="Assign badge"
          >
            <Plus className="h-3 w-3" />
            Add Badge
          </button>
        )}

        {canManageBadges && showBadgePicker && assignableBadges.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={selectedBadgeId}
              onValueChange={(value) => setSelectedBadgeId(value ?? "")}
              disabled={loadingBadges}
            >
              <SelectTrigger className="h-7 text-xs py-0 w-36 sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{loadingBadges ? "Loading…" : "Choose badge…"}</SelectItem>
                {assignableBadges.map((badge) => (
                  <SelectItem key={badge.id} value={badge.id}>
                    {badge.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-7 text-xs px-3"
              onClick={handleAssignBadge}
              disabled={!selectedBadgeId}
            >
              Assign
            </Button>
            <button
              type="button"
              onClick={() => {
                setShowBadgePicker(false);
                setSelectedBadgeId("");
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
            {badgeError && <p className="text-xs text-destructive w-full">{badgeError}</p>}
          </div>
        )}
      </div>
    </>
  );

  const mobilePhotoRingClass =
    isMemberProfile && getDueDateState(member.dueDate) === "overdue"
      ? "ring-4 ring-red-500"
      : isMemberProfile && getDueDateState(member.dueDate) === "current"
        ? "ring-4 ring-emerald-500"
        : member.status === "ACTIVE"
          ? "ring-4 ring-blue-500"
          : "ring-4 ring-yellow-500";
  const viewedRoleLabel =
    member.role === "ADMIN" ? "admin" : member.role === "COACH" ? "trainer / coach" : "member";
  const deleteDialogTitle = isMemberProfile ? "Delete member?" : `Delete ${viewedRoleLabel}?`;
  const deleteDialogDescription = isMemberProfile
    ? "This will permanently delete the member along with their payments, assigned workout plans, and plans they created. This action cannot be undone."
    : `This will permanently delete this ${viewedRoleLabel} profile. Workout plans assigned to them and workout plans created by them will be deleted. Payments they collected and attendance entries they marked will be kept, but the collected-by and marked-by references will be cleared. This action cannot be undone.`;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={deleteDialogTitle}
        description={deleteDialogDescription}
        confirmLabel="Delete"
        loading={deletingMember}
        onConfirm={handleDeleteMember}
      />

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {/* ── Mobile header: full-width photo ──────────────────────────────── */}
      <div className="sm:hidden space-y-4">
        <div
          className={cn(
            "relative w-32 h-32 mx-auto overflow-hidden rounded-2xl bg-muted",
            mobilePhotoRingClass,
          )}
        >
          {member.avatarUrl ? (
            <img
              src={resolveAssetUrl(member.avatarUrl) ?? member.avatarUrl}
              alt={member.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-7xl font-extrabold text-muted-foreground select-none">
                {getInitials(member.name)}
              </span>
            </div>
          )}
          <div
            className={cn(
              "absolute top-3 right-3 h-3.5 w-3.5 rounded-full ring-2 ring-background",
              member.status === "ACTIVE" ? "bg-green-500" : "bg-yellow-500",
            )}
          />
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold">
            <span className="text-muted-foreground font-normal">#{member.memberId} – </span>
            {member.name}
          </p>
          {memberMeta}
        </div>
        <div className="flex gap-3 justify-center">
          {member.phone && (
            <a href={`tel:${member.phone}`} className="flex flex-col items-center gap-1">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors">
                <PhoneCall className="h-5 w-5 text-green-500" />
              </span>
              <span className="text-[10px] text-muted-foreground">Call</span>
            </a>
          )}
          {member.phone && (
            <a
              href={`https://wa.me/91${member.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors">
                <MessageCircle className="h-5 w-5 text-[#25D366]" />
              </span>
              <span className="text-[10px] text-muted-foreground">WhatsApp</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => navigate(`/members/${membershipId}/edit`)}
            className="flex flex-col items-center gap-1"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors">
              <Edit className="h-5 w-5 text-primary" />
            </span>
            <span className="text-[10px] text-muted-foreground">Edit</span>
          </button>
          {role === "ADMIN" && (
            <button
              type="button"
              onClick={handleToggleStatus}
              disabled={statusLoading}
              className="flex flex-col items-center gap-1 disabled:opacity-50"
            >
              <span
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                  member.status === "ACTIVE"
                    ? "bg-yellow-500/10 hover:bg-yellow-500/20"
                    : "bg-green-500/10 hover:bg-green-500/20",
                )}
              >
                {member.status === "ACTIVE" ? (
                  <UserX className="h-5 w-5 text-yellow-500" />
                ) : (
                  <UserCheck className="h-5 w-5 text-green-500" />
                )}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {member.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </span>
            </button>
          )}
          {role === "ADMIN" && (
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deletingMember}
              className="flex flex-col items-center gap-1 disabled:opacity-50"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 transition-colors hover:bg-red-500/20">
                <Trash2 className="h-5 w-5 text-red-600" />
              </span>
              <span className="text-[10px] text-muted-foreground">Delete</span>
            </button>
          )}
        </div>
        {isMemberProfile && paymentReminderUrl && (
          <a
            href={paymentReminderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm font-medium text-yellow-800 hover:bg-yellow-100 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            Payment overdue{lastExpiry ? ` since ${lastExpiry}` : ""} — Send Reminder via WhatsApp
          </a>
        )}
      </div>

      {/* ── Desktop header: AvatarCard + action buttons below ─────────────── */}
      <div className="hidden sm:flex flex-col gap-4">
        <div className="min-w-0">
          <AvatarCard
            name={member.name}
            avatarUrl={member.avatarUrl}
            memberId={member.memberId}
            className="min-w-0"
            role={member.role}
            dueDate={isMemberProfile ? member.dueDate : null}
            isActive={member.status === "ACTIVE"}
            avatarClassName="h-20 w-20 text-xl"
          >
            {memberMeta}
          </AvatarCard>
        </div>
        <div className="flex flex-wrap gap-2">
          {member.phone && (
            <a href={`tel:${member.phone}`}>
              <Button size="sm" variant="outline">
                <PhoneCall className="h-4 w-4 mr-2 text-green-500" />
                Call
              </Button>
            </a>
          )}
          {member.phone && (
            <a
              href={`https://wa.me/91${member.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="outline">
                <MessageCircle className="h-4 w-4 mr-2 text-[#25D366]" />
                WhatsApp
              </Button>
            </a>
          )}
          <Button size="sm" onClick={() => navigate(`/members/${membershipId}/edit`)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          {role === "ADMIN" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleToggleStatus}
              disabled={statusLoading}
            >
              {member.status === "ACTIVE" ? (
                <>
                  <UserX className="h-4 w-4 mr-2 text-yellow-500" />
                  Deactivate
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2 text-green-500" />
                  Activate
                </>
              )}
            </Button>
          )}
          {role === "ADMIN" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deletingMember}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
          {isMemberProfile && paymentReminderUrl && (
            <a href={paymentReminderUrl} target="_blank" rel="noopener noreferrer">
              <Button
                size="sm"
                variant="outline"
                className="border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Send Reminder
              </Button>
            </a>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2",
          isMemberProfile ? "lg:grid-cols-4" : "lg:grid-cols-2",
        )}
      >
        {isMemberProfile && (
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() =>
              paymentsSectionRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{member.payments.length}</p>
                  <p className="text-xs text-muted-foreground">Payments</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Award className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{member.badges.length}</p>
                <p className="text-xs text-muted-foreground">Badges</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isMemberProfile && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Dumbbell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{member.planAssignments.length}</p>
                  <p className="text-xs text-muted-foreground">Workout Plans</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">
                  {member.shift ? member.shift.name : "Unassigned"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {member.shift
                    ? formatShiftWindow(member.shift.startTime, member.shift.endTime)
                    : "Shift"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isMemberProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Dumbbell className="h-5 w-5" />
              Workout Plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            {member.planAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workout plans assigned.</p>
            ) : (
              <div className="space-y-2">
                {member.planAssignments.map((pa) => (
                  <div
                    key={pa.id}
                    className="flex items-center justify-between rounded-md border px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/workouts/${pa.plan.id}`)}
                  >
                    <div>
                      <p className="font-medium">{pa.plan.title}</p>
                      {pa.plan.description && (
                        <p className="text-sm text-muted-foreground">{pa.plan.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Assigned {formatDate(pa.assignedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Attendance Calendar ─────────────────────────────────────────── */}
      {isMemberProfile && (
        <Card id="attendance">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Attendance
              </CardTitle>
              <span className="text-sm text-muted-foreground font-medium">
                {calTotal} day{calTotal !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={() => navigateMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{formatMonthLabel(calMonth)}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateMonth(1)}
                disabled={calMonth >= getMonthStr(today)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {calLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : (
              (() => {
                const first = parseMonth(calMonth);
                const daysInMonth = new Date(
                  first.getFullYear(),
                  first.getMonth() + 1,
                  0,
                ).getDate();
                const startDay = (first.getDay() + 6) % 7; // 0=Mon
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                const cells: React.ReactNode[] = [];
                for (let i = 0; i < startDay; i++) cells.push(<div key={`e-${i}`} />);
                for (let d = 1; d <= daysInMonth; d++) {
                  const dateStr = `${calMonth}-${String(d).padStart(2, "0")}`;
                  const present = calDates.has(dateStr);
                  const isToday = dateStr === todayStr;
                  cells.push(
                    <div
                      key={d}
                      className={cn(
                        "flex flex-col items-center justify-center rounded-md p-1 min-h-10 text-sm",
                        present ? "bg-green-500 text-white font-medium" : "text-muted-foreground",
                        isToday && "ring-2 ring-primary",
                      )}
                    >
                      {d}
                    </div>,
                  );
                }
                return (
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((w) => (
                      <div
                        key={w}
                        className="text-center text-xs font-medium text-muted-foreground py-1"
                      >
                        {w}
                      </div>
                    ))}
                    {cells}
                  </div>
                );
              })()
            )}
          </CardContent>
        </Card>
      )}

      {isMemberProfile && (
        <Card ref={paymentsSectionRef}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payments
              </span>
              <Link
                to={`/payments/record/${membershipId}`}
                className="ml-2 inline-flex items-center gap-1 text-sm text-secondary bg-primary rounded-sm px-2 py-1 hover:underline"
              >
                Add <PlusCircle className="h-4 w-4" />
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {member.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Valid</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {member.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <Link to={`/payments/${p.id}`} className="hover:underline">
                          {p.subscription?.title ?? p.description ?? "-"}
                        </Link>
                      </TableCell>
                      <TableCell
                        className={cn("font-semibold", PAYMENT_AMOUNT_COLOR[p.status] ?? "")}
                      >
                        {fmt(p.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {p.validFrom ? formatDate(p.validFrom) : "-"}
                        {p.validUntil ? ` -> ${formatDate(p.validUntil)}` : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(p.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
