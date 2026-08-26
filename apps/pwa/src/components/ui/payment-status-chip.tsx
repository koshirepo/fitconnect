/**
 * Documentation: Payment status as an icon chip.
 *
 * - One visual treatment for payment status, so a row on the ledger and the same
 *   payment opened in detail read identically.
 * - An unrecognised status falls back to the pending styling rather than
 *   rendering an unstyled chip, since a status this component has not been
 *   taught about is not yet money in hand.
 *
 * Primary exports: PaymentStatusChip.
 */
import * as React from "react";
import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { PersonChip } from "@/components/ui/member-card";
import type { PaymentStatus } from "@fitconnect/shared/types/enums";

/** Icon and colour per status, keyed the same way the ledger's tabs are. */
const STATUS_CHIP: Record<PaymentStatus, { icon: React.ElementType; className: string }> = {
  COMPLETED: {
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  PENDING: { icon: Clock, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  FAILED: { icon: XCircle, className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  REFUNDED: { icon: RotateCcw, className: "" },
};

export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.PENDING;

  return (
    <PersonChip icon={chip.icon} className={chip.className}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </PersonChip>
  );
}
