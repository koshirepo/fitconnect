import { getMonthStr, parseMonth, formatMonthLabel } from "@/lib/month";
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { GiftCoinsDialog } from "@/components/members/gift-coins-dialog";
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
import { MembershipGapsCard } from "./MembershipGaps";
import { MemberRfidCard } from "@/features/members/MemberRfidCard";
import { CoverageCalendar } from "@/components/members/coverage-calendar";
import { SwipePane } from "@/components/ui/swipe-pane";
import { useToast } from "@/components/ui/toast";
import { formatShiftLabel } from "@/lib/shifts";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { usePhoneDisplay } from "@/lib/use-phone-display";
import { ageFromDateOfBirth, toDateInputValue } from "@/lib/occupation";
import { OccupationGlyph } from "@/components/ui/occupation-glyph";
import { useLogReminder, useMemberReminders } from "@/api/queries/reminders";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { AssetImage } from "@/components/ui/asset-image";
import { ImageLightbox } from "@/components/ui/image-lightbox";
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
// Aliased: `Badge` in this file is the gym's own badge type, which a member
// holds several of, and the two would shadow each other.
import { Badge as StatusBadge } from "@/components/ui/badge";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Shield,
  Dumbbell,
  Salad,
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
  User,
  UserCheck,
  UserX,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Cake,
  Briefcase,
  MoreVertical,
  Printer,
  Trash2,
} from "lucide-react";
import type { Badge, MemberDetail, Shift, TenantMember } from "@/types/api";
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

/**
 * A date short enough for a stat tile: "24 Sep 26".
 *
 * Two of those tiles share a phone's width, which leaves room for about eight
 * characters — so the page's ordinary `formatDate` ("24 Sept 2026") was being
 * cut to "24 Sept …". The two-digit year is the only thing given up, and the
 * full date is still spelled out in the payments list below.
 */
function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

/**
 * One of the four things the desk does from this screen.
 *
 * A link when there is somewhere to go, a button when there is something to
 * do, and a disabled cell when the member has no phone or no card — the row
 * keeps its four columns either way, so the buttons do not move under the
 * thumb from one member to the next.
 */
function QuickAction({
  icon: Icon,
  label,
  iconClass,
  href,
  external,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  iconClass?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <Icon className={cn("h-5 w-5", iconClass)} />
      <span className="text-[11px] font-medium">{label}</span>
    </>
  );
  const shell = "flex flex-col items-center justify-center gap-1 py-3 transition-colors";

  if (href) {
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={cn(shell, "hover:bg-accent")}
      >
        {inner}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(shell, "hover:bg-accent")}>
        {inner}
      </button>
    );
  }

  return <span className={cn(shell, "cursor-not-allowed opacity-40")}>{inner}</span>;
}

export default function MemberDetailPage() {
  const { membershipId } = useParams<{ membershipId: string }>();
  const navigate = useAppNavigate();
  const location = useLocation();
  const { currentTenantId, currentMembership, user: authUser } = useAuthStore();
  const { can } = usePermissions();
  // Staff without `members:phone:read` read the number masked. The call and
  // WhatsApp links below still carry the real digits.
  const { canReadPhone, format: formatPhone } = usePhoneDisplay();
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
  const [photoZoomOpen, setPhotoZoomOpen] = React.useState(false);
  const [deletingMember, setDeletingMember] = React.useState(false);
  const paymentsSectionRef = React.useRef<HTMLDivElement>(null);

  const memberQuery = useMember(membershipId);
  const member = memberQuery.data ?? null;
  const loading = memberQuery.isLoading;
  const error = actionError || (memberQuery.isError ? getApiError(memberQuery.error) : "");
  const isMemberProfile = member?.role === "MEMBER";
  // The phone field is only editable by someone who can read it — a masked
  // field has nothing meaningful to type over.
  const canEditPhone = canReadPhone || (Boolean(member?.userId) && member?.userId === authUser?.id);
  // Read only by someone allowed to; for a coach the endpoint is a 403.
  const roleMatrix = useTenantRoleMatrix(can(Permission.ROLES_READ) ? currentTenantId : null).data;

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
  // The same grant that lets somebody invent a discount. Writing coins into a
  // balance is that act by another route and should not be a lesser permission.
  const canGiftCoins = can(Permission.COUPONS_CREATE);
  const [giftOpen, setGiftOpen] = React.useState(false);

  const settingsQuery = useTenantSettings();
  const tenantSettings = settingsQuery.data ?? null;

  // Badges are only needed for the assignment picker; shifts only in edit mode.
  const badgesQuery = useBadges({ enabled: canManageBadges });
  const availableBadges = React.useMemo<Badge[]>(() => badgesQuery.data ?? [], [badgesQuery.data]);
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
  // Only the month's count is read here; the grid itself is `CoverageCalendar`,
  // which fetches the same month under the same cache key — so this is one
  // request serving both the heading and the days below it.
  const calTotal = calendarQuery.data?.total ?? 0;

  const handleToggleStatus = async () => {
    if (!membershipId || !member) return;
    const newStatus = member.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setStatusLoading(true);
    setActionError("");
    try {
      // No optimistic patch needed: the mutation invalidates the member query,
      // so the refetched record is the source of truth for the new status.
      await updateMemberStatus.mutateAsync({ membershipId, status: newStatus });
      toast.success(newStatus === "ACTIVE" ? "Member activated." : "Member deactivated.");
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
      // A masked field is never an edit, however the form comes back.
      const phoneChanged = canEditPhone && data.phone !== (member.phone ?? "");
      const dobChanged = data.dateOfBirth !== toDateInputValue(member.dateOfBirth);
      const occupationChanged = data.occupationId !== (member.occupationId ?? "");
      const genderChanged = data.gender !== (member.gender ?? null);
      const nextShiftId = data.shiftId || null;
      const currentShiftId = member.shift?.id ?? null;
      const shiftChanged = nextShiftId !== currentShiftId;
      const avatarChanged = Boolean(data.photoFile) || data.photoPreview !== member.avatarUrl;

      if (
        !roleChanged &&
        !nameChanged &&
        !phoneChanged &&
        !dobChanged &&
        !occupationChanged &&
        !genderChanged &&
        !shiftChanged &&
        !avatarChanged
      ) {
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

      if (
        nameChanged ||
        phoneChanged ||
        dobChanged ||
        occupationChanged ||
        genderChanged ||
        shiftChanged ||
        avatarUrl !== undefined
      ) {
        await updateMember.mutateAsync({
          membershipId,
          data: {
            ...(nameChanged ? { name: data.name } : {}),
            ...(phoneChanged ? { phone: data.phone } : {}),
            ...(dobChanged ? { dateOfBirth: data.dateOfBirth } : {}),
            // "" is the member clearing it, which the API takes as null.
            ...(occupationChanged ? { occupationId: data.occupationId || null } : {}),
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
    () =>
      paymentReminderText && member?.phone
        ? buildWhatsAppUrl(member.phone, paymentReminderText)
        : null,
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
      <div className="space-y-5 sm:space-y-6">
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
      <div className="space-y-5 sm:space-y-6">
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
                // Masked for staff who may not read it, and read-only there, so
                // the placeholder text can never be saved over the real number.
                phone: formatPhone(member.phone, member.userId) ?? "",
                dateOfBirth: toDateInputValue(member.dateOfBirth),
                occupationId: member.occupationId ?? "",
                // Left unset for records from before the field existed, so the
                // form falls back to its own default rather than to null.
                ...(member.gender ? { gender: member.gender } : {}),
                role: member.role,
                shiftId: member.shift?.id ?? "",
                photoPreview: member.avatarUrl,
              }}
              phoneReadOnly={!canEditPhone}
              currentOccupation={member.occupation}
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

  // ─── Presentation ───────────────────────────────────────────────────────────
  const memberGender = genderMeta(member.gender);
  const memberAge = ageFromDateOfBirth(member.dateOfBirth);

  /**
   * Everything the gym knows about the person, as labelled facts.
   *
   * These used to run along one line as unlabelled chips — an envelope, a
   * phone, a cake, a clock — which read as a row of icons rather than as a
   * record. A label costs one line and answers "17:00–22:00 of what?".
   */
  const facts: { icon: React.ElementType; label: string; value: React.ReactNode }[] = [
    { icon: Phone, label: "Phone", value: formatPhone(member.phone, member.userId) ?? "—" },
    { icon: Mail, label: "Email", value: member.email },
    {
      icon: memberGender?.icon ?? User,
      label: "Gender",
      value: memberGender?.label ?? "Not recorded",
    },
    {
      icon: Cake,
      label: "Date of birth",
      value: member.dateOfBirth
        ? `${formatDate(member.dateOfBirth)}${memberAge !== null ? ` · ${memberAge} yrs` : ""}`
        : "Not recorded",
    },
    {
      icon: Briefcase,
      label: "Occupation",
      value: member.occupation ? (
        <span className="flex items-center gap-1.5">
          <OccupationGlyph icon={member.occupation.icon} className="h-3.5 w-3.5 shrink-0" />
          {member.occupation.name}
        </span>
      ) : (
        "Not recorded"
      ),
    },
    { icon: Calendar, label: "Joined", value: formatDate(member.joinedAt) },
    {
      icon: Clock,
      label: "Shift",
      value: member.shift ? formatShiftLabel(member.shift) : "Unassigned",
    },
  ];

  /** The ring around the photo says the one thing worth seeing from across the room. */
  const photoRingClass =
    isMemberProfile && getDueDateState(member.dueDate) === "overdue"
      ? "ring-red-500"
      : isMemberProfile && getDueDateState(member.dueDate) === "current"
        ? "ring-emerald-500"
        : member.status === "ACTIVE"
          ? "ring-blue-500"
          : "ring-yellow-500";

  const viewedRoleLabel =
    member.role === "ADMIN"
      ? "admin"
      : member.role === "COACH"
        ? "trainer / coach"
        : (roleMatrix?.roles.find((role) => role.role === member.role)?.label?.toLowerCase() ??
          "member");
  const deleteDialogTitle = isMemberProfile ? "Delete member?" : `Delete ${viewedRoleLabel}?`;
  const deleteDialogDescription = isMemberProfile
    ? "This will permanently delete the member along with their payments, assigned workout and diet plans, and plans they created. This action cannot be undone."
    : `This will permanently delete this ${viewedRoleLabel} profile. Workout and diet plans assigned to them or created by them will be deleted. Payments they collected and attendance entries they marked will be kept, but the collected-by and marked-by references will be cleared. This action cannot be undone.`;

  /** The membership tile's headline: when this term runs out, or that it has. */
  const validUntilDate = member.payments
    .filter((payment) => payment.validUntil)
    .map((payment) => new Date(payment.validUntil!).getTime())
    .sort((a, b) => b - a)[0];

  const editPath = getTenantDashboardPath(`/members/${membershipId}/edit`);
  const whatsappUrl = buildWhatsAppUrl(member.phone, `Hi ${member.name}`);

  return (
    <SwipePane
      paneKey={membershipId ?? "member"}
      paneIndex={siblings.index}
      onNext={() => goToSibling(siblings.nextId)}
      onPrevious={() => goToSibling(siblings.previousId)}
      // Full-bleed on a phone. Everything here is a square-cornered card
      // with its own 16px inside, so the layout's gutter was a second inset
      // around a first one; from `sm` the page sits inside it again.
      className="-mx-3 space-y-3 sm:mx-0 sm:space-y-5"
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

      <ImageLightbox
        src={member.avatarUrl}
        alt={member.name}
        open={photoZoomOpen}
        onOpenChange={setPhotoZoomOpen}
      />

      {error && (
        <div className="mx-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-0">
          {error}
        </div>
      )}

      {/* ── Who this is ──────────────────────────────────────────────────────
          One header at every width, rather than a phone version and a desktop
          version of the same facts kept in step by hand. The photo shrinks and
          the actions wrap; nothing appears or disappears with the viewport. */}
      <Card className="overflow-hidden py-0">
        {/* A wash of the gym's accent behind the identity block, so the page
            opens on the person rather than on a white field of cards. */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => member.avatarUrl && setPhotoZoomOpen(true)}
              className={cn(
                "relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted ring-2 ring-offset-2 ring-offset-background sm:size-24",
                photoRingClass,
                member.avatarUrl ? "cursor-zoom-in" : "cursor-default",
              )}
              aria-label={member.avatarUrl ? "View photo" : undefined}
            >
              {member.avatarUrl ? (
                /* `AssetImage` rather than a bare tag: it falls back to the
                   address the photo was stored at when the proxy cannot serve
                   it, which is the difference between a face and initials. */
                <AssetImage
                  src={member.avatarUrl}
                  alt={member.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl font-extrabold text-muted-foreground select-none sm:text-3xl">
                  {getInitials(member.name)}
                </span>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">#{member.memberId}</p>
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                {member.name}
              </h1>
            </div>

            {/* The one fact the desk opens this page for, beside the name
                rather than in a tile of its own further down. It used to head a
                three-tile row whose other two — days attended, payments on
                record — both restated a section further down the page, so the
                row is gone and this is the only place the date appears. */}
            {isMemberProfile && (
              <div className="hidden shrink-0 border-l pl-4 text-right sm:block">
                <p className="text-xs text-muted-foreground">
                  {isDue ? "Expired" : "Valid to"}
                </p>
                <p
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    isDue ? "text-red-600" : "text-emerald-600",
                  )}
                >
                  {validUntilDate ? shortDate(new Date(validUntilDate).toISOString()) : "—"}
                </p>
                {!validUntilDate && (
                  <p className="text-[11px] text-muted-foreground">No paid term yet</p>
                )}
              </div>
            )}

            {/* Everything that changes or ends this membership, behind one
                control. Edit sat beside Delete on the old header, which put a
                destructive button under the thumb of anyone reaching for the
                common one. */}
            {(canChangeStatus || canDeleteMember) && (
              <Menu>
                <MenuTrigger
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </MenuTrigger>
                <MenuContent align="end">
                  <MenuItem onClick={() => navigate(editPath)}>
                    <Edit className="h-4 w-4" />
                    Edit details
                  </MenuItem>
                  {canChangeStatus && (
                    <MenuItem onClick={handleToggleStatus} disabled={statusLoading}>
                      {member.status === "ACTIVE" ? (
                        <>
                          <UserX className="h-4 w-4 text-yellow-500" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-4 w-4 text-green-500" />
                          Activate
                        </>
                      )}
                    </MenuItem>
                  )}
                  {canDeleteMember && (
                    <>
                      <MenuSeparator />
                      <MenuItem
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={deletingMember}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </MenuItem>
                    </>
                  )}
                </MenuContent>
              </Menu>
            )}
          </div>

          {/* Under the photo and the name rather than beside them: squeezed
              into the column next to a 96px photo and a menu button, three
              short chips were already wrapping onto a second line on a phone.
              Down here they have the card's whole width, and wrap only when
              they genuinely run out of it. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatusBadge variant={member.status === "ACTIVE" ? "success" : "destructive"}>
              {member.status === "ACTIVE" ? "Active" : "Inactive"}
            </StatusBadge>
            <StatusBadge variant="outline">{viewedRoleLabel}</StatusBadge>
            {isMemberProfile && isDue && (
              <StatusBadge variant="destructive">
                {lastExpiry ? `Due since ${lastExpiry}` : "Payment due"}
              </StatusBadge>
            )}
            {member.occupation && (
              <StatusBadge variant="outline">
                <OccupationGlyph icon={member.occupation.icon} className="h-3 w-3" />
                {member.occupation.name}
              </StatusBadge>
            )}
            {memberAge !== null && (
              <StatusBadge variant="outline">
                <Cake className="h-3 w-3" />
                {memberAge}
              </StatusBadge>
            )}
            {/* No coin chip here. The balance is on the "give coins" button in
                the profile card, which carries the same number and does
                something with it — two copies of one figure is one too many,
                and the copy that acts is the one worth keeping. */}
          </div>
        </div>

        {/* The four things the desk does from this screen, as one row of equal
            targets — the same buttons a phone had, at a size a mouse is happy
            with too. */}
        <div className="grid grid-cols-4 divide-x border-t">
          <QuickAction
            icon={PhoneCall}
            label="Call"
            iconClass="text-green-600"
            href={member.phone ? `tel:${member.phone}` : undefined}
          />
          <QuickAction
            icon={MessageCircle}
            label="WhatsApp"
            iconClass="text-[#25D366]"
            href={whatsappUrl ?? undefined}
            external
          />
          <QuickAction
            icon={CreditCard}
            label="Card"
            iconClass="text-blue-600"
            href={member.idCardUrl ?? undefined}
          />
          <QuickAction
            icon={Edit}
            label="Edit"
            iconClass="text-primary"
            onClick={() => navigate(editPath)}
          />
        </div>
      </Card>

      {/* The one thing that cannot wait, in the one place nobody scrolls past. */}
      {isMemberProfile && paymentReminderUrl && (
        <a
          href={paymentReminderUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={recordReminderSend}
          className="mx-3 flex items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm font-medium text-yellow-800 transition-colors hover:bg-yellow-100 sm:mx-0 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            Payment overdue{lastExpiry ? ` since ${lastExpiry}` : ""} — send a reminder
          </span>
          <MessageCircle className="h-4 w-4 shrink-0" />
        </a>
      )}

      {/* On a phone the header has no room beside the name, so the expiry gets
          its own line here instead of a tile. Same single fact, one breakpoint
          apart — never both at once. */}
      {isMemberProfile && (
        <div className="flex items-baseline justify-between gap-3 rounded-lg border px-4 py-2.5 sm:hidden">
          <span className="text-xs text-muted-foreground">
            {isDue ? "Membership expired" : "Membership valid to"}
          </span>
          <span
            className={cn(
              "text-base font-bold tabular-nums",
              isDue ? "text-red-600" : "text-emerald-600",
            )}
          >
            {validUntilDate ? shortDate(new Date(validUntilDate).toISOString()) : "No paid term"}
          </span>
        </div>
      )}

      {/* ── The record itself ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-start gap-2.5">
                <fact.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="truncate text-sm font-medium">{fact.value}</dd>
                </div>
              </div>
            ))}
          </dl>

          {/* Badges, and the card that identifies them at the door. Both are
              things this member holds, so they sit together under the facts
              rather than competing with them in the header. */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {member.badges.map((badge) => (
              <span
                key={badge.id}
                title={badge.name}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ backgroundColor: badge.color }}
                >
                  {(badge.icon ?? badge.name).charAt(0).toUpperCase()}
                </span>
                {badge.name}
                {canManageBadges && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBadge(badge.id)}
                    className="ml-0.5 rounded-full text-muted-foreground transition-colors hover:text-destructive"
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
                className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Plus className="h-3 w-3 shrink-0" />
                Add badge
              </button>
            )}

            {canManageBadges && showBadgePicker && assignableBadges.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={selectedBadgeId}
                  onValueChange={(value) => setSelectedBadgeId(value ?? "")}
                  disabled={loadingBadges}
                >
                  <SelectTrigger className="h-7 w-36 py-0 text-xs sm:w-44">
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
                  className="h-7 px-3 text-xs"
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
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
                {badgeError && <p className="w-full text-xs text-destructive">{badgeError}</p>}
              </div>
            )}

            {canGiftCoins && (
              <button
                type="button"
                onClick={() => setGiftOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
              >
                <Coins className="h-3.5 w-3.5 shrink-0" />
                {coinBalance > 0 ? `${coinBalance} coins · give more` : "Give coins"}
              </button>
            )}

            {member.idCardUrl && (
              /* The card, not this page.

                 A dashboard URL is no use to anybody without a login and the
                 permission to read members, so sharing it would hand most
                 recipients a sign-in screen. The card link is the member's
                 own, works for whoever opens it, and is what the welcome
                 message already sends — this is the same link, offered again
                 when somebody at the desk needs to re-send it.

                 What it exposes is deliberately narrow: a name, a number, a
                 photo and the dates. Nothing more than the member would show
                 at the front desk, which is the standard the card was built to. */
              <ShareButton
                url={member.idCardUrl}
                title={`${member.name} — membership card`}
                text={`Your membership card at ${currentMembership()?.tenantName ?? "the gym"}.`}
                label="Send card"
                size="sm"
                className="h-auto rounded-full px-3 py-1 text-xs"
              />
            )}

            {member.idCardUrl && (
              /* Straight to the card printer at the desk.
                 Opens the card on its own page with `print=1`, which puts the
                 print dialog up as soon as it has drawn — one click from here
                 to a card coming out, rather than finding the page first. */
              <Button
                variant="outline"
                size="sm"
                className="h-auto rounded-full px-3 py-1 text-xs"
                onClick={() =>
                  window.open(
                    `${member.idCardUrl}${member.idCardUrl!.includes("?") ? "&" : "?"}print=1`,
                    "_blank",
                    "noopener",
                  )
                }
              >
                <Printer className="h-3.5 w-3.5 shrink-0" />
                Print card
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/*
        Two columns from `xl`, one below it.

        Everything under the header used to be a single stack of full-width
        cards, which on a wide screen ran a 148px card across 1100px of nothing
        while the timeline and the payment table — the things that actually want
        the width — got no more of it than the "assign a card" box did.

        The split is by what a card is *for*, not by length: the left column is
        the member's record, read top to bottom, and the right is the handful of
        things the desk does to the membership. `items-start` so neither column
        stretches to the other's height.
      */}
      <div className="grid gap-3 sm:gap-5 xl:grid-cols-3 xl:items-start">
        {/* What the desk does. First in the DOM so a phone, which has one
            column, still meets these before a year of history. */}
        <div className="space-y-3 sm:space-y-5 xl:order-2 xl:col-span-1">
          {/* Every role, not members only: admins and coaches walk through the
              same door and are on the same readers. The PIN it defaults to is
              the membership's own number, which every membership has. */}
          {membershipId && (
            <MemberRfidCard
              membershipId={membershipId}
              memberId={member.memberId}
              deviceUserPin={member.deviceUserPin}
              rfidCardNumber={member.rfidCardNumber}
              onChanged={() => void memberQuery.refetch()}
            />
          )}

          {isMemberProfile && membershipId && <FreezeCard membershipId={membershipId} isStaff />}
        </div>

        {/* The record itself, widest because it is the part with tables and a
            calendar in it. */}
        <div className="space-y-3 sm:space-y-5 xl:order-1 xl:col-span-2">
          {/* Whether this person keeps their membership running, or lets it
              lapse a few days between every term on purpose. Only for members:
              staff have no terms to leave gaps between. */}
          {isMemberProfile && membershipId && <MembershipGapsCard membershipId={membershipId} />}

      {/* ── Attendance ─────────────────────────────────────────────────────── */}
      {isMemberProfile && (
        <Card id="attendance">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Attendance
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => navigateMonth(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-28 text-center text-sm font-medium">
                  {formatMonthLabel(calMonth)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateMonth(1)}
                  disabled={calMonth >= getMonthStr(today)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardDescription>
              {calTotal} day{calTotal !== 1 ? "s" : ""} this month
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            {/* The same grid the record-payment screen draws when the desk
                picks a start date. One component, so a member's month cannot
                look like two different months a click apart. */}
            <CoverageCalendar membershipId={membershipId!} month={calMonth} />
          </CardContent>
        </Card>
      )}

      {/* ── Payments ───────────────────────────────────────────────────────── */}
      {isMemberProfile && (
        <Card ref={paymentsSectionRef}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payments
              </CardTitle>
              <Link
                to={`/payments/record/${membershipId}`}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <PlusCircle className="h-4 w-4" />
                Add
              </Link>
            </div>
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
                          <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                            {p.validFrom ? formatDate(p.validFrom) : "-"}
                            {p.validUntil ? ` → ${formatDate(p.validUntil)}` : ""}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
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

      {/* ── Workout plans ──────────────────────────────────────────────────── */}
      {isMemberProfile && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5" />
              Workout plans
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
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-muted/50"
                    onClick={() => navigate(`/workouts/${pa.plan.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{pa.plan.title}</p>
                      {pa.plan.description && (
                        <p className="truncate text-sm text-muted-foreground">
                          {pa.plan.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(pa.assignedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Diet plans ─────────────────────────────────────────────────────── */}
      {isMemberProfile && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Salad className="h-5 w-5" />
              Diet plans
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(member.dietPlanAssignments ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No diet plans assigned.</p>
            ) : (
              <div className="space-y-2">
                {(member.dietPlanAssignments ?? []).map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-4 py-3 transition-colors hover:bg-muted/50"
                    onClick={() => navigate(`/diet-plans/${assignment.plan.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{assignment.plan.title}</p>
                      {assignment.plan.description && (
                        <p className="truncate text-sm text-muted-foreground">
                          {assignment.plan.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(assignment.assignedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
        </div>
      </div>

      {/* ── What it has taken to collect from this member ──────────────────── */}
      {isMemberProfile && canSeeMoney && reminders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>
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
                  {reminder.paymentId && <p className="text-[10px] text-emerald-600">settled</p>}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {canGiftCoins && (
        <GiftCoinsDialog
          membershipId={membershipId!}
          memberName={member.name}
          balance={coinBalance}
          open={giftOpen}
          onOpenChange={setGiftOpen}
        />
      )}
    </SwipePane>
  );
}
