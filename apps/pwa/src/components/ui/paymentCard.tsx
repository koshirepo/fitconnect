import { cn } from "@/lib/utils";
import { Badge } from "./badge";
import type { PaymentStatus } from "@/types/api";

const variantConfig = {
  /** Compact — table rows, small lists */
  sm: {
    containerClass: "text-sm",
    amountClass: "text-lg font-semibold",
    metaClass: "text-xs text-muted-foreground",
    gap: "gap-2",
  },
  /** Default — cards, sidebar items */
  md: {
    containerClass: "text-base",
    amountClass: "text-2xl font-semibold",
    metaClass: "text-sm text-muted-foreground",
    gap: "gap-3",
  },
  /** Page headers */
  lg: {
    containerClass: "text-lg",
    amountClass: "text-3xl font-extrabold",
    metaClass: "text-base text-muted-foreground",
    gap: "gap-4",
  },
};

type Variant = keyof typeof variantConfig;

const statusVariant = (status: PaymentStatus) => {
  switch (status) {
    case "COMPLETED":
      return "success" as const;
    case "PENDING":
      return "warning" as const;
    case "FAILED":
    case "REFUNDED":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
};

interface PaymentCardProps {
  amount: string;
  status: PaymentStatus;
  title?: string;
  date?: string;
  variant?: Variant;
  /** Stack content on top instead of side-by-side */
  vertical?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export default function PaymentCard({
  amount,
  status,
  title,
  date,
  variant = "md",
  vertical = false,
  children,
  className,
}: PaymentCardProps) {
  const config = variantConfig[variant];

  return (
    <div
      className={cn(
        "flex items-start",
        vertical ? "flex-col gap-2" : config.gap,
        vertical && "text-center",
        className,
      )}
    >
      {/* Amount */}
      <div className={cn(vertical ? "" : "flex-1")}>
        <p className={cn(config.amountClass)}>{amount}</p>
        {title && <p className="text-sm font-medium">{title}</p>}
        {date && <p className={config.metaClass}>{date}</p>}
      </div>

      {/* Status Badge */}
      <Badge variant={statusVariant(status)}>{status}</Badge>

      {/* Additional Content */}
      {children && <div className={cn(vertical ? "w-full" : "")}>{children}</div>}
    </div>
  );
}
