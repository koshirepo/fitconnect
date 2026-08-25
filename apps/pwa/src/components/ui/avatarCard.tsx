/**
 * Documentation: Inline person identity.
 *
 * - A thin adapter over `MemberCard`, so every place that shows an avatar with a name — payment rows, attendance entries, the sidebar, dialogs, profile headers — gets the same square-tile treatment as the member list without each screen restating it.
 * - The props are the ones call sites already used (`variant`, `memberId`, `isActive`, `dueDate`, `role`, `vertical`, `children`); they are translated to the card's vocabulary here.
 * - Prefer `MemberCard` directly for new list screens: it takes a person object and renders the full bordered row.
 * - Primary exports: default export.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { AvatarTile, MemberCard, type CardPerson, type MemberCardSize } from "./member-card";

/** Legacy size names, mapped onto the card's two real sizes. */
const SIZE_FOR_VARIANT: Record<Variant, MemberCardSize> = {
  sm: "sm",
  md: "sm",
  lg: "md",
  xl: "md",
};

const STACKED_TILE_CLASS: Record<Variant, string> = {
  sm: "h-12 w-12",
  md: "h-16 w-16",
  lg: "h-20 w-20",
  xl: "h-28 w-28",
};

const STACKED_NAME_CLASS: Record<Variant, string> = {
  sm: "text-sm font-semibold",
  md: "text-base font-semibold",
  lg: "text-lg font-semibold tracking-tight",
  xl: "text-2xl font-extrabold tracking-tight sm:text-3xl",
};

type Variant = "sm" | "md" | "lg" | "xl";

type UserRole = "ADMIN" | "COACH" | "TRAINER" | "MEMBER";

interface AvatarCardProps {
  name: string;
  avatarUrl?: string | null;
  /** Drives the gender chip; omit for people the app has nothing on file for. */
  gender?: string | null;
  variant?: Variant;
  /** Tenant-scoped sequential member number — renders as "#N – name". */
  memberId?: number;
  /** Stack avatar on top of text instead of side-by-side. */
  vertical?: boolean;
  avatarClassName?: string;
  children?: React.ReactNode;
  className?: string;
  /** Whether the user is active; drives the tile's edge colour. */
  isActive?: boolean;
  dueDate?: string | null;
  /** Adds the role badge for admins and coaches. */
  role?: UserRole;
}

export default function AvatarCard({
  name,
  avatarUrl,
  gender,
  variant = "lg",
  memberId,
  vertical = false,
  avatarClassName,
  children,
  className,
  isActive,
  dueDate,
  role,
}: AvatarCardProps) {
  // Memoised because `isDue` reads the clock: recomputing it on every render
  // would make an otherwise-identical person object unstable.
  const person: CardPerson = React.useMemo(
    () => ({
      name,
      avatarUrl,
      gender,
      memberId,
      role,
      // `isActive` is the caller's vocabulary; the card reasons in status strings.
      status: isActive === undefined ? undefined : isActive ? "ACTIVE" : "SUSPENDED",
      dueDate,
      isDue: Boolean(dueDate) && new Date(dueDate!) < new Date(),
    }),
    [name, avatarUrl, gender, memberId, role, isActive, dueDate],
  );

  const size = SIZE_FOR_VARIANT[variant];

  if (vertical) {
    return (
      <div className={cn("flex flex-col items-center gap-3 text-center", className)}>
        <AvatarTile
          person={person}
          size={size}
          stacked
          className={cn(STACKED_TILE_CLASS[variant], avatarClassName)}
        />
        <div className="min-w-0">
          <p className={STACKED_NAME_CLASS[variant]}>
            {memberId !== undefined && (
              <span className="font-semibold text-muted-foreground">#{memberId} – </span>
            )}
            {name}
          </p>
          {children}
        </div>
      </div>
    );
  }

  return (
    <MemberCard
      person={person}
      size={size}
      variant="inline"
      subtitle={children}
      className={className}
    />
  );
}
