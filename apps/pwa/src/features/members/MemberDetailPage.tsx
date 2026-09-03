import { getMonthStr, parseMonth, formatMonthLabel } from "@/lib/month";
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useParams, useLocation, Link } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useTenantRoleMatrix } from "@/api/queries/roles";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMember,
  useRemoveMember,
  useUpdateMember,
  useUpdateMemberRole,
  useUpdateMemberStatus,
} from "@/api/queries/members";
import {
  useAssignBadge,
  useBadges,
  useShifts,
  useTenantSettings,
  useUnassignBadge,
} from "@/api/queries/catalog";
import { queryKeys } from "@/lib/query-keys";
import { uploadsApi } from "@/api/uploads";
import { useMemberAttendanceCalendar } from "@/api/queries/attendance";
import { getApiError } from "@/api/client";
import { formatDate, getInitials } from "@fitconnect/shared";
import { getDueDateState } from "@/lib/member-due";
import { genderMeta } from "@/lib/gender";
import { useAdjacentRecord } from "@/lib/use-adjacent-record";
import { useCoinBalance } from "@/api/queries/coupons";
import { FreezeCard } from "@/components/ui/freeze-card";
import { SwipePane } from "@/components/ui/swipe-pane";
import { useToast } from "@/components/ui/toast";
import { formatShiftLabel, formatShiftWindow } from "@/lib/shifts";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useLogReminder, useMemberReminders } from "@/api/queries/reminders";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { resolveAssetUrl } from "@/lib/assets";
import {
  getTenantWhatsAppTemplateBody,
  renderWhatsAppTemplateBody,
} from "@/lib/whatsapp-templates";
import { cn } from "@/lib/utils";
import { PaymentStatusChip } from "@/components/ui/payment-status-chip";
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
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Shield,
  Award,
  Dumbbell,
  Clock,
  CreditCard,
  Coins,
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
import type { Badge, MemberDetail, Shift, TenantMember } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";
import MemberForm, { type MemberFormData } from "@/components/forms/MemberForm";
import { ShareButton } from "@/components/ui/share-button";

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

/** What each reminder was about, in the words the desk uses. */
const REMINDER_REASON_LABELS: Record<string, string> = {
  RENEWAL_DUE: "Renewal due",
  EXPIRED: "Membership expired",
  PENDING_PAYMENT: "Pending payment",
  SUSPENDED: "Marked inactive",
};

/** Who sent a manual reminder, when the record knows. */
function whatsappSender(reminder: { actor?: { user: { name: string } } | null }) {
  return reminder.actor ? `WhatsApp · ${reminder.actor.user.name}` : "WhatsApp";
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function MemberDetailPage() {
  const { membershipId } = useParams<{ membershipId: string }>();
  const navigate = useAppNavigate();
  const location = useLocation();
  const { currentTenantId, currentMembership } = useAuthStore();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const gymName = currentMembership()?.tenantName ?? "the gym";
  const canManageBadges = can(Permission.BADGES_ASSIGN);
  const canChangeStatus = can(Permission.MEMBERS_STATUS_UPDATE);
  const canDeleteMember = can(Permission.MEMBERS_DELETE);
  // The chase history is part of this member's money story, so it follows the
  // same grant as the payments themselves.
  const canSeeMoney = can(Permission.PAYMENTS_READ);

  const isEditMode = location.pathname.endsWith("/edit");

  const toast = useToast();

  const [actionError, setActionError] = React.useState("");

  const [editSubmitting, setEditSubmitting] = React.useState(false);
  const [editError, setEditError] = React.useState("");

  const [selectedBadgeId, setSelectedBadgeId] = React.useState("");
  const [badgeError, setBadgeError] = React.useState("");

  const [showBadgePicker, setShowBadgePicker] = React.useState(false);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deletingMember, setDeletingMember] = React.useState(false);
  const paymentsSectionRef = React.useRef<HTMLDivElement>(null);

  const memberQuery = useMember(membershipId);
  const member = memberQuery.data ?? null;
  const loading = memberQuery.isLoading;
  const error = actionError || (memberQuery.isError ? getApiError(memberQuery.error) : "");
  const isMemberProfile = member?.role === "MEMBER";
  // Read only by someone allowed to; for a coach the endpoint is a 403.
  const roleMatrix = useTenantRoleMatrix(
    can(Permission.ROLES_READ) ? currentTenantId : null,
  ).data;

  /**
   * The members either side of this one, taken from the list cache so a swipe
   * costs nothing. Deep-linked here with no cached list, there are simply no
   * neighbours and the gesture does nothing.
   */
  const siblings = useAdjacentRecord<TenantMember>({
    queryKey: queryKeys.members.list(currentTenantId ?? "none", { all: true }),
    currentId: membershipId,
    sort: (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
  });

  const goToSibling = (id: string | null) => {
    // `replace` so swiping through ten members does not bury the list ten
    // entries deep in the back stack.
    if (id) navigate(getTenantDashboardPath(`/members/${id}`), { replace: true });
  };

  // Only worth showing when they actually have some.
  const coinsQuery = useCoinBalance(membershipId);
  const coinBalance = coinsQuery.data?.balance ?? 0;

  const settingsQuery = useTenantSettings();
  const tenantSettings = settingsQuery.data ?? null;

  // Badges are only needed for the assignment picker; shifts only in edit mode.
  const badgesQuery = useBadges({ enabled: canManageBadges });
  const availableBadges = React.useMemo<Badge[]>(
    () => badgesQuery.data ?? [],
    [badgesQuery.data],
  );
  const loadingBadges = badgesQuery.isLoading;

  const shiftsQuery = useShifts(true, { enabled: isEditMode });
  const shiftOptions = React.useMemo<Shift[]>(() => shiftsQuery.data ?? [], [shiftsQuery.data]);
  const loadingShifts = shiftsQuery.isLoading;

  // Every write below invalidates the members key, so this detail view and the
  // member list both refresh without an explicit re-read.
  const updateMember = useUpdateMember();
  const updateMemberRole = useUpdateMemberRole();
  const updateMemberStatus = useUpdateMemberStatus();
  const removeMember = useRemoveMember();
  const assignBadge = useAssignBadge();
  const unassignBadge = useUnassignBadge();

  // Scroll to hash target (e.g. #attendance) once data is loaded
  React.useEffect(() => {
    if (loading || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, location.hash]);

  // ─── Attendance calendar ────────────────────────────────────────────────────
  const today = new Date();
  const [calMonth, setCalMonth] = React.useState(getMonthStr(today));

  const navigateMonth = (dir: -1 | 1) => {
    const d = parseMonth(calMonth);
    d.setMonth(d.getMonth() + dir);
    setCalMonth(getMonthStr(d));
  };

  // Only members have an attendance history worth charting. The month is part
  // of the cache key, so stepping back and forth reuses months already loaded.
  const calendarQuery = useMemberAttendanceCalendar(membershipId, calMonth, {
    enabled: isMemberProfile,
  });
  const calDates = React.useMemo(
    () => new Set(calendarQuery.data?.dates ?? []),
    [calendarQuery.data],
  );
  const calTotal = calendarQuery.data?.total ?? 0;
  const calLoading = calendarQuery.isLoading;

  const handleToggleStatus = async () => {
    if (!membershipId || !member) return;
    const newStatus = member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setStatusLoading(true);
    setActionError("");
    try {
      // No optimistic patch needed: the mutation invalidates the member query,
      // so the refetched record is the source of truth for the new status.
      await updateMemberStatus.mutateAsync({ membershipId, status: newStatus });
      toast.success(
        newStatus === "ACTIVE" ? "Member activated." : "Member deactivated.",
      );
    } catch (err: unknown) {
      setActionError(getApiError(err));
      toast.error({
        message: "Could not change this member's status.",
        description: getApiError(err),
      });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!membershipId) return;

    setDeletingMember(true);
    setActionError("");
    try {
      await removeMember.mutateAsync(membershipId);
      // Fired before navigating; the toast outlives the page it came from.
      toast.success(`${member?.name ?? "Member"} was deleted.`);
      navigate(getTenantDashboardPath("/members"), { replace: true });
    } catch (err: unknown) {
      setActionError(getApiError(err));
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
      const genderChanged = data.gender !== (member.gender ?? null);
      const nextShiftId = data.shiftId || null;
      const currentShiftId = member.shift?.id ?? null;
      const shiftChanged = nextShiftId !== currentShiftId;
      const avatarChanged = Boolean(data.photoFile) || data.photoPreview !== member.avatarUrl;

      if (!roleChanged && !nameChanged && !phoneChanged && !genderChanged && !shiftChanged && !avatarChanged) {
        navigate(getTenantDashboardPath(`/members/${membershipId}`), { replace: true });
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
        await updateMemberRole.mutateAsync({ membershipId, role: data.role });
      }

      if (nameChanged || phoneChanged || genderChanged || shiftChanged || avatarUrl !== undefined) {
        await updateMember.mutateAsync({
          membershipId,
          data: {
            ...(nameChanged ? { name: data.name } : {}),
            ...(phoneChanged ? { phone: data.phone } : {}),
            ...(genderChanged ? { gender: data.gender } : {}),
            ...(shiftChanged ? { shiftId: nextShiftId } : {}),
            ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          },
        });
      }

      navigate(getTenantDashboardPath(`/members/${membershipId}`), { replace: true });
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

  /**
   * Badge changes stay optimistic so the chip reacts instantly and the picker
   * can stay open for the next one. The patch is applied to the cached member
   * record rather than to local state, so it survives the invalidation the
   * mutation triggers and every other reader of that record sees it too.
   */
  const patchCachedBadges = React.useCallback(
    (update: (badges: MemberDetail["badges"]) => MemberDetail["badges"]) => {
      if (!currentTenantId || !membershipId) return;
      queryClient.setQueryData<MemberDetail>(
        queryKeys.members.detail(currentTenantId, membershipId),
        (prev) => (prev ? { ...prev, badges: update(prev.badges) } : prev),
      );
    },
    [queryClient, currentTenantId, membershipId],
  );

  const handleAssignBadge = async () => {
    if (!membershipId || !selectedBadgeId) return;

    const badge = availableBadges.find((b) => b.id === selectedBadgeId);
    if (!badge) return;

    setBadgeError("");
    patchCachedBadges((badges) => [...badges, badge]);
    setSelectedBadgeId("");

    try {
      await assignBadge.mutateAsync({ badgeId: badge.id, data: { membershipId } });
    } catch (err: unknown) {
      patchCachedBadges((badges) => badges.filter((b) => b.id !== badge.id));
      setSelectedBadgeId(badge.id);
      setBadgeError(getApiError(err));
    }
  };

  const handleRemoveBadge = async (badgeId: string) => {
    if (!membershipId) return;

    const badge = member?.badges.find((b) => b.id === badgeId);
    if (!badge) return;

    setBadgeError("");
    patchCachedBadges((badges) => badges.filter((b) => b.id !== badgeId));

    try {
      await unassignBadge.mutateAsync({ badgeId, membershipId });
    } catch (err: unknown) {
      patchCachedBadges((badges) => [...badges, badge]);
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

  const paymentReminderText = React.useMemo(() => {
    if (!isMemberProfile || !isDue || !member?.phone) return null;
    return renderWhatsAppTemplateBody(paymentReminderTemplateBody, {
      memberName: member.name,
      gymName,
      expirySuffix: lastExpiry ? ` on ${lastExpiry}` : "",
    });
  }, [isDue, isMemberProfile, member, paymentReminderTemplateBody, gymName, lastExpiry]);

  const paymentReminderUrl = React.useMemo(
    () => (paymentReminderText && member?.phone
      ? buildWhatsAppUrl(member.phone, paymentReminderText)
      : null),
    [member, paymentReminderText],
  );

  // The chase history for this member, and the recorder for the button below.
  const remindersQuery = useMemberReminders(membershipId, { enabled: canSeeMoney });
  const logReminder = useLogReminder();
  const reminders = remindersQuery.data?.reminders ?? [];
  const outstandingReminders = remindersQuery.data?.outstanding ?? 0;

  /** Record the WhatsApp reminder as it opens; never block the send. */
  const recordReminderSend = () => {
    if (!membershipId) return;
    logReminder.mutate({
      membershipId,
      payload: {
        channel: "WHATSAPP",
        reason: "RENEWAL_DUE",
        ...(paymentReminderText ? { message: paymentReminderText } : {}),
      },
    });
  };

  if (loading) return <DetailPageSkeleton />;

  if (!member) {
    const isNotFound = error.toLowerCase().includes("not found");
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Shield}
          title={isNotFound ? "Member not found" : "Unable to load member"}
          description={error || "Could not load this member right now."}
          action={
            <Button variant="outline" onClick={() => void memberQuery.refetch()}>
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
                // Left unset for records from before the field existed, so the
                // form falls back to its own default rather than to null.
                ...(member.gender ? { gender: member.gender } : {}),
                role: member.role,
                shiftId: member.shift?.id ?? "",
                photoPreview: member.avatarUrl,
              }}
              shiftOptions={shiftOptions}
              loadingShifts={loadingShifts}
              onSubmit={handleEditSubmit}
              onCancel={() => navigate(getTenantDashboardPath(`/members/${membershipId}`))}
              submitLabel="Save Changes"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Shared meta + badges (used in both mobile and desktop layouts) ──────────
  const memberGender = genderMeta(member.gender);

  const memberMeta = (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
        {/* The email is the one item that can be long enough to push the row
            around, so it gets the whole line to itself and truncates. */}
        <span className="flex w-full min-w-0 items-center gap-1 sm:w-auto">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{member.email}</span>
        </span>
        {member.phone && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            {member.phone}
          </span>
        )}
        {memberGender && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <memberGender.icon className="h-3.5 w-3.5 shrink-0" />
            {memberGender.label}
          </span>
        )}
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          Joined {formatDate(member.joinedAt)}
        </span>
        {member.shift && (
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {formatShiftLabel(member.shift)}
          </span>
        )}
      </div>

      {/* Coins and the card link share a row: they are both things this member
          holds rather than facts about them, and stacked one per line they
          pushed the badges — which staff actually edit — below the fold. */}
      {(coinBalance > 0 || member.idCardUrl) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {coinBalance > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Coins className="h-3.5 w-3.5" />
              {coinBalance} coins to spend
            </span>
          )}

          {member.idCardUrl && (
            <>
              <a
                href={member.idCardUrl}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Membership card
              </a>

              {/* The card, not this page.

                  A dashboard URL is no use to anybody without a login and the
                  permission to read members, so sharing it would hand most
                  recipients a sign-in screen. The card link is the member's own,
                  works for whoever opens it, and is what the welcome message
                  already sends — this is the same link, offered again when
                  somebody at the desk needs to re-send it.

                  What it exposes is deliberately narrow: a name, a number, a
                  photo and the dates. Nothing more than the member would show
                  at the front desk, which is the standard the card was built to. */}
              <ShareButton
                url={member.idCardUrl}
                title={`${member.name} — membership card`}
                text={`Your membership card at ${currentMembership()?.tenantName ?? "the gym"}.`}
                label="Send card"
                size="sm"
                className="h-auto rounded-full px-3 py-1.5 text-xs"
              />
            </>
          )}
        </div>
      )}

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
    member.role === "ADMIN"
      ? "admin"
      : member.role === "COACH"
        ? "trainer / coach"
        : roleMatrix?.roles.find((role) => role.role === member.role)?.label?.toLowerCase() ??
          "member";
  const deleteDialogTitle = isMemberProfile ? "Delete member?" : `Delete ${viewedRoleLabel}?`;
  const deleteDialogDescription = isMemberProfile
    ? "This will permanently delete the member along with their payments, assigned workout plans, and plans they created. This action cannot be undone."
    : `This will permanently delete this ${viewedRoleLabel} profile. Workout plans assigned to them and workout plans created by them will be deleted. Payments they collected and attendance entries they marked will be kept, but the collected-by and marked-by references will be cleared. This action cannot be undone.`;

  return (
    <SwipePane
      paneKey={membershipId ?? "member"}
      paneIndex={siblings.index}
      onNext={() => goToSibling(siblings.nextId)}
      onPrevious={() => goToSibling(siblings.previousId)}
      className="space-y-6"
    >
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
            onClick={() => navigate(getTenantDashboardPath(`/members/${membershipId}/edit`))}
            className="flex flex-col items-center gap-1"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors">
              <Edit className="h-5 w-5 text-primary" />
            </span>
            <span className="text-[10px] text-muted-foreground">Edit</span>
          </button>
          {canChangeStatus && (
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
          {canDeleteMember && (
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
            onClick={recordReminderSend}
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
            gender={member.gender}
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
          <Button size="sm" onClick={() => navigate(getTenantDashboardPath(`/members/${membershipId}/edit`))}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          {canChangeStatus && (
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
          {canDeleteMember && (
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
            <a
              href={paymentReminderUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={recordReminderSend}
            >
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

      {isMemberProfile && membershipId && (
        <FreezeCard membershipId={membershipId} isStaff />
      )}

      <div
        className={cn(
          "grid grid-cols-2 gap-3 sm:gap-4",
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
            <CardContent className="px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
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
          <CardContent className="px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
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
            <CardContent className="px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
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
          <CardContent className="px-4 pt-4 pb-4 sm:px-6 sm:pt-6">
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

      {/* What it has taken to collect from this member. */}
      {isMemberProfile && canSeeMoney && reminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              <Link
                to={getTenantDashboardPath("/reminders")}
                className="flex items-center gap-2 hover:underline"
              >
                <MessageCircle className="h-5 w-5" />
                Reminders sent
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </CardTitle>
            <CardDescription>
              {outstandingReminders > 0
                ? `${outstandingReminders} still unanswered — the rest are linked to the payments that followed.`
                : "All linked to the payments that followed them."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {reminders.slice(0, 10).map((reminder) => (
              <Link
                key={reminder.id}
                to={getTenantDashboardPath(`/reminders/${reminder.id}`)}
                className="-mx-2 flex items-start justify-between gap-3 rounded-md border-b px-2 py-2 last:border-0 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {REMINDER_REASON_LABELS[reminder.reason] ?? reminder.reason}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {reminder.channel === "WHATSAPP" ? whatsappSender(reminder) : "Push"}
                    </span>
                  </p>
                  {reminder.message && (
                    <p className="truncate text-xs text-muted-foreground">{reminder.message}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">{formatDate(reminder.sentAt)}</p>
                  {reminder.paymentId && (
                    <p className="text-[10px] text-emerald-600">settled</p>
                  )}
                </div>
              </Link>
            ))}
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
              <>
                {/*
                  Two layouts for one list. A four-column table in a card on a
                  phone put the validity range and the whole date column off
                  the right edge — the dates were not merely cramped, they were
                  unreachable. Below `sm` each payment becomes a stacked row
                  instead; from `sm` up the table returns, because scanning
                  twenty payments down aligned columns is what a table is for.

                  Status is shown in both. The table carried it only as the
                  amount's colour, which meant a failed payment and a settled
                  one read the same to anyone not comparing shades.
                */}
                <ul className="divide-y sm:hidden">
                  {member.payments.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/payments/${p.id}`}
                        className="flex flex-col gap-1.5 py-3 hover:bg-muted/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="min-w-0 flex-1 font-medium">
                            {p.subscription?.title ?? p.description ?? "-"}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 font-semibold",
                              PAYMENT_AMOUNT_COLOR[p.status] ?? "",
                            )}
                          >
                            {fmt(p.amount)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <PaymentStatusChip status={p.status} />
                          <span>{formatDate(p.createdAt)}</span>
                        </div>
                        {p.validFrom && (
                          <p className="text-xs text-muted-foreground">
                            Valid {formatDate(p.validFrom)}
                            {p.validUntil ? ` → ${formatDate(p.validUntil)}` : ""}
                          </p>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>

                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subscription</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
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
                          <TableCell>
                            <PaymentStatusChip status={p.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {p.validFrom ? formatDate(p.validFrom) : "-"}
                            {p.validUntil ? ` → ${formatDate(p.validUntil)}` : ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(p.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </SwipePane>
  );
}
