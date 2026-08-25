import { getInitials } from "@fitconnect/shared";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { cn } from "@/lib/utils";
import { getDueDateState } from "@/lib/member-due";
import { Shield, Dumbbell } from "lucide-react";

const variantConfig = {
  /** Compact — table rows, small lists */
  sm: {
    avatarSize: "sm" as const,
    avatarClass: "",
    gap: "gap-2",
    nameClass: "text-sm font-medium",
  },
  /** Default — cards, sidebar items */
  md: {
    avatarSize: "default" as const,
    avatarClass: "",
    gap: "gap-3",
    nameClass: "text-base font-semibold",
  },
  /** Page headers */
  lg: {
    avatarSize: "lg" as const,
    avatarClass: "",
    gap: "gap-4",
    nameClass: "text-lg font-semibold tracking-tight",
  },
  /** Hero / profile banners */
  xl: {
    avatarSize: "lg" as const,
    avatarClass: "h-20 w-20 text-xl",
    gap: "gap-6",
    nameClass: "text-3xl font-extrabold tracking-tight sm:text-4xl",
  },
};

type Variant = keyof typeof variantConfig;

type UserRole = "ADMIN" | "COACH" | "TRAINER" | "MEMBER";

interface AvatarCardProps {
  name: string;
  avatarUrl?: string | null;
  variant?: Variant;
  /** Tenant-scoped sequential member number — renders as "#N – name" */
  memberId?: number;
  /** Stack avatar on top of text instead of side-by-side */
  vertical?: boolean;
  avatarClassName?: string;
  children?: React.ReactNode;
  className?: string;
  /** Whether the user is active */
  isActive?: boolean;
  dueDate?: string | null;
  /** User role for icon overlay (only shown for admin/trainer roles) */
  role?: UserRole;
}

export default function AvatarCard({
  name,
  avatarUrl,
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
  const config = variantConfig[variant];
  const dueDateState = getDueDateState(dueDate);
  const ringClass =
    dueDateState === "overdue"
      ? "ring-2 ring-red-500"
      : dueDateState === "current"
        ? "ring-2 ring-emerald-500"
        : isActive
          ? "ring-2 ring-blue-500"
          : isActive !== undefined
            ? "ring-2 ring-yellow-500"
            : "";

  // Get role icon and size based on variant
  const getRoleIcon = () => {
    if (!role) return null;

    const iconProps =
      variant === "xl"
        ? { className: "h-6 w-6" }
        : variant === "lg"
          ? { className: "h-5 w-5" }
          : variant === "md"
            ? { className: "h-4 w-4" }
            : { className: "h-3 w-3" };

    switch (role) {
      case "ADMIN":
        return <Shield {...iconProps} className={cn(iconProps.className, "text-white")} />;
      case "COACH":
      case "TRAINER":
        return <Dumbbell {...iconProps} className={cn(iconProps.className, "text-white")} />;
      default:
        return null;
    }
  };

  const roleIcon = getRoleIcon();

  return (
    <div
      className={cn(
        "flex",
        vertical ? "flex-col items-center text-center" : "items-center",
        config.gap,
        className,
      )}
    >
      <div className={cn("relative", ringClass)} style={{ borderRadius: "9999px" }}>
        <Avatar size={config.avatarSize} className={cn(config.avatarClass, avatarClassName)}>
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
          <AvatarFallback>{getInitials(name)}</AvatarFallback>
        </Avatar>
        {roleIcon && (
          <div className="absolute bottom-0 right-0 flex h-1/3 w-1/3 items-center justify-center rounded-full bg-linear-to-br from-slate-700 to-slate-900 shadow-lg">
            {roleIcon}
          </div>
        )}
      </div>
      <div className={cn(vertical ? "" : "flex-1 min-w-0")}>
        <p className={cn(config.nameClass, !vertical && "truncate")}>
          {memberId !== undefined && (
            <span className="text-muted-foreground font-normal">#{memberId} – </span>
          )}
          {name}
        </p>
        {children}
      </div>
    </div>
  );
}
