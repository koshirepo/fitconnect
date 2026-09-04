/**
 * Documentation: Telling a staff member their pay moved.
 *
 * - One place for the three channels, so the same facts reach email, push and WhatsApp without each caller assembling them again.
 * - Email and push are sent here and their failures swallowed. A mail server having a slow afternoon must not fail the payment that triggered it — the money moved either way, and a payment that threw after writing its rows would be worse than a notification nobody received.
 * - WhatsApp is *not* sent. This app has no WhatsApp Business API credentials: every WhatsApp message it has ever sent was a `wa.me` link opened in the sender's own browser. So the text is rendered here and returned to the caller, and the person recording the payment sends it with one tap. Pretending otherwise would silently drop the message.
 * - Primary exports: buildSalaryNotice, sendSalaryNotice.
 */
import { prisma } from "../../lib/prisma";
import { emailService } from "../../lib/email";
import { pushService } from "../push/push.service";
import { settingsRepository } from "../settings/settings.repository";
import { renderWhatsAppTemplate } from "@fitconnect/shared/whatsapp-templates";
import { formatCurrency } from "@fitconnect/shared";

type StaffContact = {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
};

/** "2026-09" as a person would say it. */
function monthLabel(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A synthetic address is not a mailbox.
 *
 * Phone-only members are given `<phone>@name.com` so the row has a unique login,
 * and mail to it bounces into nowhere. Same rule as the admission flow.
 */
function isRealEmail(email: string | null): email is string {
  return Boolean(email && !/^\d+@/u.test(email));
}

type SalaryEvent =
  | {
      kind: "PAYMENT";
      amount: number;
      method: string;
      month: string;
      paid: number;
      payable: number;
      outstanding: number;
      note?: string | null;
    }
  | {
      kind: "COMPENSATION";
      monthlyAmount: number;
      month: string;
    }
  | {
      kind: "COMPONENT";
      componentKind: string;
      label: string;
      amount: number;
      month: string;
      payable: number;
      outstanding: number;
    };

const COMPONENT_WORDS: Record<string, string> = {
  BONUS: "bonus",
  INCENTIVE: "incentive",
  BENEFIT: "benefit",
  DEDUCTION: "deduction",
};

/**
 * Render the message for one event, and send the two channels that can be sent.
 *
 * Returns the WhatsApp text so the caller can hand it to the UI. Never throws:
 * this runs after the money is already recorded.
 */
export async function sendSalaryNotice(
  tenantId: string,
  staff: StaffContact,
  event: SalaryEvent,
): Promise<{ whatsappText: string | null; phone: string | null }> {
  try {
    const [tenant, settings] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      settingsRepository.getSettings(tenantId),
    ]);

    const gymName = tenant?.name ?? "Fit Connect";
    const label = monthLabel(event.month);

    let subject: string;
    let headline: string;
    let pushTitle: string;
    let pushBody: string;
    let whatsappText: string;
    let lines: { label: string; value: string }[];

    if (event.kind === "PAYMENT") {
      subject = `Salary payment of ${formatCurrency(event.amount)} — ${gymName}`;
      headline = "Salary paid";
      pushTitle = `Salary: ${formatCurrency(event.amount)} paid`;
      pushBody = `${gymName} recorded ${formatCurrency(event.amount)} for ${label}.${
        event.outstanding > 0 ? ` ${formatCurrency(event.outstanding)} still to come.` : ""
      }`;
      lines = [
        { label: "Paid now", value: formatCurrency(event.amount) },
        { label: "Method", value: event.method },
        { label: "Paid so far", value: formatCurrency(event.paid) },
        { label: "Month total", value: formatCurrency(event.payable) },
        { label: "Outstanding", value: formatCurrency(event.outstanding) },
      ];
      whatsappText = renderWhatsAppTemplate(
        "salary_payment",
        {
          staffName: staff.name,
          gymName,
          amount: formatCurrency(event.amount),
          monthLabel: label,
          method: event.method,
          paidLine: `Paid so far: ${formatCurrency(event.paid)} of ${formatCurrency(event.payable)}\n`,
          outstandingLine:
            event.outstanding > 0
              ? `Still outstanding: ${formatCurrency(event.outstanding)}\n`
              : "This month is now fully paid.\n",
          noteLine: event.note ? `Note: ${event.note}\n` : "",
        },
        settings?.whatsappTemplates,
      );
    } else if (event.kind === "COMPENSATION") {
      subject = `Your monthly salary is now ${formatCurrency(event.monthlyAmount)} — ${gymName}`;
      headline = "Monthly salary updated";
      pushTitle = "Salary updated";
      pushBody = `Your monthly salary at ${gymName} is now ${formatCurrency(event.monthlyAmount)}.`;
      lines = [{ label: "Monthly salary", value: formatCurrency(event.monthlyAmount) }];
      whatsappText = renderWhatsAppTemplate(
        "salary_updated",
        {
          staffName: staff.name,
          gymName,
          monthLabel: label,
          changeLine: `Your monthly salary is now *${formatCurrency(event.monthlyAmount)}*.\n`,
          payableLine: "",
        },
        settings?.whatsappTemplates,
      );
    } else {
      const word = COMPONENT_WORDS[event.componentKind] ?? "adjustment";
      const signed =
        event.componentKind === "DEDUCTION"
          ? `less ${formatCurrency(event.amount)}`
          : `plus ${formatCurrency(event.amount)}`;

      subject = `A ${word} was added to your ${label} pay — ${gymName}`;
      headline = `${word.charAt(0).toUpperCase()}${word.slice(1)} added`;
      pushTitle = `Salary ${word}: ${formatCurrency(event.amount)}`;
      pushBody = `${event.label} — ${signed} on your ${label} pay.`;
      lines = [
        { label: event.label, value: signed },
        { label: "Month total", value: formatCurrency(event.payable) },
        { label: "Outstanding", value: formatCurrency(event.outstanding) },
      ];
      whatsappText = renderWhatsAppTemplate(
        "salary_updated",
        {
          staffName: staff.name,
          gymName,
          monthLabel: label,
          changeLine: `*${event.label}* — ${signed} on your ${label} pay.\n`,
          payableLine: `Your ${label} pay now comes to ${formatCurrency(event.payable)}, of which ${formatCurrency(event.outstanding)} is outstanding.\n`,
        },
        settings?.whatsappTemplates,
      );
    }

    // Both are best-effort and independent: a bounced email must not cost the
    // push, and neither must cost the caller.
    await Promise.allSettled([
      isRealEmail(staff.email)
        ? emailService.sendSalaryEmail({
            to: staff.email,
            staffName: staff.name,
            gymName,
            subject,
            headline,
            monthLabel: label,
            lines,
          })
        : Promise.resolve(),
      pushService.notifySalary(staff.userId, { title: pushTitle, body: pushBody }),
    ]);

    return { whatsappText, phone: staff.phone };
  } catch (err) {
    console.error("[salary] notification failed", err);
    return { whatsappText: null, phone: staff.phone };
  }
}
