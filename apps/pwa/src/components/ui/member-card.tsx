/**
 * Documentation: The shared person card.
 *
 * - One presentation for every place the app shows a person: a square avatar tile with a status-coloured edge and a role badge, then optional chips, the `#id – name` line, and a subtitle.
 * - `variant="card"` is the bordered row used by the member list; `variant="inline"` is the same identity block without card chrome, for embedding inside a row that already has its own container (a payment line, an attendance entry, a dialog).
 * - Everything derived from the person — the accent colour, the role icon, the status and due chips — is computed here, so a member looks the same on every screen without each screen re-deriving it.
 * - Primary exports: MemberCard, PersonChip.
 */
import * as React from "react";
import { getInitials } from "@fitconnect/shared";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { Card } from "./card";
import { Ban, CalendarClock, CheckCircle2, Dumbbell, Shield } from "lucide-react";
import { genderMeta } from "@/lib/gender";
import { ImageLightbox } from "./image-lightbox";

export type PersonRole = "ADMIN" | "COACH" | "TRAINER" | "MEMBER" | string;

export type CardPerson = {
  name: string;
  avatarUrl?: string | null;
  /** Tenant-scoped sequential member number — renders as "#N – name". */
  memberId?: number;
  role?: PersonRole;
  /** "MALE" | "FEMALE" | "OTHER"; null on records that predate the field. */
  gender?: string | null;
  status?: string;
  dueDate?: string | null;
  /** Set when the membership has lapsed; drives the red accent. */
  isDue?: boolean;
};

/**
 * Small pill above the name — status, due date, sync state.
 *
 * `iconOnlyOnMobile` drops the words on a phone and keeps the glyph, which is
 * how several of these fit on one line on the screen this app is mostly used
 * on. Reserve it for chips whose icon and colour already carry the meaning; a
 * chip whose value is the text (a date, an amount) has to keep its label.
 */
export function PersonChip({
  icon: Icon,
  children,
  iconOnlyOnMobile = false,
  className,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  iconOnlyOnMobile?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground sm:gap-1.5 sm:px-2 sm:py-1 sm:text-xs",
        // Without the label there is nothing to space away from the icon, and
        // the pill would otherwise sit lopsided around it.
        iconOnlyOnMobile && "gap-0 px-1 sm:gap-1.5 sm:px-2",
        className,
      )}
      // The words are still the accessible name when they are visually hidden.
      title={iconOnlyOnMobile && typeof children === "string" ? children : undefined}
    >
      <Icon className="size-2.5 sm:size-3.5" />
      {iconOnlyOnMobile ? (
        <span className="hidden sm:inline">{children}</span>
      ) : (
        children
      )}
    </span>
  );
}

const SIZES = {
  /**
   * Denser rows — payments, attendance, pickers — with the same flush-left
   * tile as the member list, just scaled down.
   */
  sm: {
    row: "min-h-16 sm:min-h-20",
    tile: "min-w-14 sm:min-w-20",
    fallback: "text-base sm:text-xl",
    roleBadge: "size-4 sm:size-5",
    roleIcon: "h-2.5 w-2.5 sm:h-3 sm:w-3",
    body: "px-3 py-2 sm:px-4 sm:py-3",
    name: "text-sm font-bold tracking-tight sm:text-base",
    subtitle: "text-xs sm:text-sm",
    fixedTile: false,
  },
  /** List cards and page headers. */
  md: {
    row: "min-h-20 sm:min-h-32",
    tile: "min-w-16 sm:min-w-24",
    fallback: "text-xl sm:text-3xl",
    roleBadge: "size-5 sm:size-6",
    roleIcon: "h-3 w-3 sm:h-3.5 sm:w-3.5",
    body: "px-3 py-2 sm:px-5 sm:py-4",
    name: "text-base font-bold tracking-tight sm:text-xl",
    subtitle: "text-sm sm:text-base",
    fixedTile: false,
  },
} as const;

export type MemberCardSize = keyof typeof SIZES;

/** Edge colour: overdue reads red, active green, anything else amber. */
function accentClass(person: CardPerson) {
  if (person.isDue) return "border-red-500";
  if (person.status === undefined) return "border-border";
  return person.status === "ACTIVE" ? "border-emerald-500" : "border-amber-500";
}

/**
 * The badge glyph for a role, as an element rather than a component reference —
 * a component picked during render would remount whenever the role changed.
 */
function roleIconFor(role: PersonRole | undefined, className: string) {
  if (role === "ADMIN") return <Shield className={className} />;
  if (role === "COACH" || role === "TRAINER") return <Dumbbell className={className} />;
  return null;
}

/**
 * The square avatar tile: photo or initials, a status-coloured edge, and a role
 * badge. Shared so the stacked profile header looks like the list rows.
 */
export function AvatarTile({
  person,
  size,
  rounded,
  stacked = false,
  zoomable = true,
  className,
}: {
  person: CardPerson;
  size: MemberCardSize;
  rounded?: boolean;
  /** Centred square rather than flush-left, for stacked profile headers. */
  stacked?: boolean;
  /**
   * Whether tapping the photo opens it full size.
   *
   * Off for tiles inside a row that is itself clickable, where the tap already
   * means "open this person" and a viewer would be in the way of it.
   */
  zoomable?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const canZoom = zoomable && Boolean(person.avatarUrl);
  const roleIcon = roleIconFor(person.role, cn(s.roleIcon, "text-white"));

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        stacked
          ? // Fixed square with a full border, since there is no row to inherit
            // a height from and no card edge to sit flush against.
            "aspect-square rounded-xl border-2"
          : s.fixedTile
            ? // Fixed square, centred in its row.
              cn("rounded-md border-2", s.tile)
            : // Height comes from the row; aspect-square derives the width from
              // it, so the tile always fills the full card height.
              cn("aspect-square h-full self-stretch border-r-2", s.tile),
        rounded && !stacked && !s.fixedTile && "rounded-l-lg",
        accentClass(person),
        className,
      )}
    >
      {/* Absolutely positioned so the photo's intrinsic size can't drive the width. */}
      {person.avatarUrl ? (
        <img
          src={person.avatarUrl}
          alt={person.name}
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-0 size-full object-cover",
            canZoom && "cursor-zoom-in",
          )}
          onClick={
            canZoom
              ? (event) => {
                  // The row around this is usually a link or a click handler to
                  // the person's page. Both are stopped here: tapping the face
                  // shows the face, and every other part of the row still opens
                  // the person.
                  event.preventDefault();
                  event.stopPropagation();
                  setZoomOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-muted font-semibold tracking-wide text-muted-foreground",
            s.fallback,
          )}
        >
          {getInitials(person.name)}
        </div>
      )}
      {roleIcon && (
        <div
          className={cn(
            "absolute right-1 bottom-1 flex items-center justify-center rounded-full bg-linear-to-br from-slate-700 to-slate-900 shadow-lg",
            s.roleBadge,
          )}
        >
          {roleIcon}
        </div>
      )}

      {canZoom && (
        <ImageLightbox
          src={person.avatarUrl}
          alt={person.name}
          open={zoomOpen}
          onOpenChange={setZoomOpen}
        />
      )}
    </div>
  );
}

type MemberCardProps = {
  person: CardPerson;
  size?: MemberCardSize;
  /** "card" adds the bordered container; "inline" is the identity block alone. */
  variant?: "card" | "inline";
  /**
   * Show the derived status and due-date chips. Off by default for embedded
   * rows, where the surrounding context usually carries that information.
   */
  showStatusChips?: boolean;
  /** Extra chips rendered after the derived ones. */
  chips?: React.ReactNode;
  /** The line under the name — phone, email, plan, whatever the screen needs. */
  subtitle?: React.ReactNode;
  /**
   * Clamp the subtitle to a single line. On by default for list rows, where a
   * ragged second line breaks the rhythm; off for embedded blocks, which often
   * pass several lines of detail.
   */
  truncateSubtitle?: boolean;
  /**
   * Allow the name line to wrap instead of truncating to one ellipsised line.
   * Off by default for list rows, where a ragged name breaks the rhythm; on for
   * pickers, where the whole point is telling similar members apart.
   */
  wrapName?: boolean;
  /** Trailing content, right-aligned: actions, amounts, badges. */
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

export function MemberCard({
  person,
  size = "md",
  variant = "card",
  showStatusChips = variant === "card",
  chips,
  subtitle,
  truncateSubtitle = variant === "card",
  wrapName = false,
  actions,
  onClick,
  className,
}: MemberCardProps) {
  const s = SIZES[size];
  const isCard = variant === "card";
  const interactive = Boolean(onClick);

  // Shown wherever a person is, not only on the full card: it is part of who
  // someone is rather than a state that the surrounding screen already carries.
  const gender = genderMeta(person.gender);
  const genderChip = gender ? (
    <PersonChip icon={gender.icon} iconOnlyOnMobile className={gender.chipClass}>
      {gender.label}
    </PersonChip>
  ) : null;

  const derivedChips = showStatusChips ? (
    <>
      {person.status === "ACTIVE" ? (
        <PersonChip
          icon={CheckCircle2}
          iconOnlyOnMobile
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        >
          Active
        </PersonChip>
      ) : person.status ? (
        <PersonChip
          icon={Ban}
          iconOnlyOnMobile
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        >
          Inactive
        </PersonChip>
      ) : null}
      {person.dueDate && (
        <PersonChip
          icon={CalendarClock}
          className={person.isDue ? "bg-red-500/10 text-red-600 dark:text-red-400" : undefined}
        >
          <span className="hidden sm:inline">Until </span>
          {formatDate(person.dueDate)}
        </PersonChip>
      )}
    </>
  ) : null;

  const hasChips = Boolean(genderChip || derivedChips || chips);

  const body = (
    // `relative` anchors the actions, which are pinned to the bottom row on a
    // phone rather than sitting beside the name.
    <div className={cn("relative flex items-stretch", s.row)}>
      <div
        className={cn("flex min-w-0 flex-1 items-stretch", interactive && "cursor-pointer")}
        onClick={onClick}
      >
        {/* The photo opens itself even though the row around it opens the
            person: the tile stops the click from reaching the row, so the two
            targets stay distinct rather than one swallowing the other. */}
        <AvatarTile person={person} size={size} rounded={isCard} />

        <div className={cn("min-w-0 flex-1 self-center", s.body)}>
          {hasChips && (
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden sm:gap-2">
              {genderChip}
              {derivedChips}
              {chips}
            </div>
          )}

          <p
            className={cn(
              hasChips && "mt-2",
              wrapName ? "" : "truncate",
              s.name,
            )}
          >
            {person.memberId !== undefined && (
              <span className="font-semibold text-muted-foreground">#{person.memberId} – </span>
            )}
            {person.name}
          </p>

          {subtitle && (
            <div
              className={cn(
                "mt-1 min-w-0 text-muted-foreground",
                truncateSubtitle && "truncate",
                // Keeps a long phone number from running under the buttons
                // that sit on this line on a phone.
                actions && "pr-24 sm:pr-0",
                s.subtitle,
              )}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {actions && (
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 sm:gap-2",
            // Phone: on the subtitle line at the bottom of the card, where
            // there is room the name row does not have.
            "absolute right-2 bottom-1",
            // Anything wider: back in the row, centred against the whole card.
            "sm:static sm:justify-end sm:pr-4",
          )}
        >
          {actions}
        </div>
      )}
    </div>
  );

  if (!isCard) {
    return <div className={cn("min-w-0", className)}>{body}</div>;
  }

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-lg py-0 ring-1 ring-border transition-shadow",
        interactive && "hover:shadow-md",
        className,
      )}
    >
      {body}
    </Card>
  );
}

export default MemberCard;
