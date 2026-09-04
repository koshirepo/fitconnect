/**
 * Documentation: One person's pay for one month.
 *
 * - Where the money is actually recorded: the agreed monthly figure, anything added or taken off, and each payment handed over. A month can be paid in as many parts as it takes.
 * - The payment box is capped at what is still outstanding, and the server refuses more than that as well. Two checks rather than one because the first is a courtesy and the second is the rule — a stale page must not be able to overpay somebody.
 * - A staff member reading their own month sees the same figures with none of the controls, because this is also their payslip.
 * - Primary exports: StaffSalaryPage.
 */
import * as React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import {
  useAddSalaryComponent,
  useDeleteSalaryPayment,
  useRecordSalaryPayment,
  useRemoveSalaryComponent,
  useSalaryCycle,
  useSetCompensation,
} from "@/api/queries/finance";
import type { SalaryComponentKind, SalaryPaymentMethod } from "@/api/finance";
import { getApiError } from "@/api/client";
import { getMonthStr, formatMonthLabel, shiftMonth } from "@/lib/month";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardSkeleton } from "@/components/ui/skeleton";
import { AvatarTile } from "@/components/ui/member-card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Plus,
  Trash2,
} from "lucide-react";

const KINDS: { value: SalaryComponentKind; label: string }[] = [
  { value: "BONUS", label: "Bonus" },
  { value: "INCENTIVE", label: "Incentive" },
  { value: "BENEFIT", label: "Benefit" },
  { value: "DEDUCTION", label: "Deduction" },
];

const METHODS: SalaryPaymentMethod[] = ["CASH", "BANK", "UPI", "OTHER"];

function parseAmount(value: string) {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Open the message in WhatsApp.
 *
 * The API renders the text but cannot send it — the gym has no WhatsApp
 * Business credentials, so every WhatsApp message this app produces is a
 * `wa.me` link opened by the sender's own browser. Same shape as the admission
 * and receipt flows.
 */
function openWhatsApp(text: string | null, phone: string | null) {
  if (!text || !phone) return false;

  const digits = phone.replace(/[^0-9]/g, "");
  if (!digits) return false;

  const withCountry = digits.startsWith("91") ? digits : `91${digits}`;
  window.open(
    `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer",
  );
  return true;
}

export default function StaffSalaryPage() {
  const { membershipId } = useParams<{ membershipId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useAppNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can(Permission.SALARY_MANAGE);

  const month = searchParams.get("month") || getMonthStr(new Date());
  const isCurrentMonth = month >= getMonthStr(new Date());

  const query = useSalaryCycle(membershipId, month);
  const setCompensation = useSetCompensation();
  const addComponent = useAddSalaryComponent();
  const removeComponent = useRemoveSalaryComponent();
  const recordPayment = useRecordSalaryPayment();
  const deletePayment = useDeleteSalaryPayment();

  const [monthly, setMonthly] = React.useState("");
  const [showCompForm, setShowCompForm] = React.useState(false);

  const [kind, setKind] = React.useState<SalaryComponentKind>("BONUS");
  const [componentLabel, setComponentLabel] = React.useState("");
  const [componentAmount, setComponentAmount] = React.useState("");

  /** The last update, kept so it can be sent on WhatsApp without resending it. */
  const [pendingNotice, setPendingNotice] = React.useState<{
    text: string;
    phone: string | null;
    what: string;
  } | null>(null);

  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState<SalaryPaymentMethod>("CASH");
  const [payNote, setPayNote] = React.useState("");

  const data = query.data;
  const cycle = data?.cycle ?? null;
  const goMonth = (delta: number) => setSearchParams({ month: shiftMonth(month, delta) });

  const saveCompensation = async () => {
    const value = parseAmount(monthly);
    if (!membershipId || !value) {
      toast.error("Enter a whole-rupee monthly amount.");
      return;
    }

    try {
      const res = await setCompensation.mutateAsync({ membershipId, monthlyAmount: value });
      toast.success("Monthly salary saved. Email and push sent.");
      if (res.whatsappText) {
        setPendingNotice({
          text: res.whatsappText,
          phone: res.phone,
          what: "the new monthly salary",
        });
      }
      setShowCompForm(false);
      setMonthly("");
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const submitComponent = async () => {
    const value = parseAmount(componentAmount);
    if (!cycle || !componentLabel.trim() || !value) {
      toast.error("A name and a whole-rupee amount are needed.");
      return;
    }

    try {
      const res = await addComponent.mutateAsync({
        cycleId: cycle.id,
        kind,
        label: componentLabel.trim(),
        amount: value,
      });
      toast.success("Added. Email and push sent.");
      if (res.whatsappText) {
        setPendingNotice({ text: res.whatsappText, phone: res.phone, what: "this update" });
      }
      setComponentLabel("");
      setComponentAmount("");
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const submitPayment = async () => {
    const value = parseAmount(payAmount);
    if (!cycle || !value) {
      toast.error("Enter a whole-rupee amount.");
      return;
    }

    try {
      const res = await recordPayment.mutateAsync({
        cycleId: cycle.id,
        amount: value,
        method: payMethod,
        note: payNote.trim() || undefined,
      });

      // A payment is a receipt, so WhatsApp opens straight away rather than
      // waiting to be asked. The other edits are smaller and get a button.
      const opened = openWhatsApp(res.whatsappText, res.phone);
      toast.success(
        opened
          ? `${formatCurrency(value)} recorded. Email, push and WhatsApp sent.`
          : `${formatCurrency(value)} recorded. Email and push sent.`,
      );
      if (!opened && res.whatsappText) {
        setPendingNotice({ text: res.whatsappText, phone: res.phone, what: "this payment" });
      }

      setPayAmount("");
      setPayNote("");
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  if (query.isPending) return <CardSkeleton />;

  if (query.isError || !data) {
    return (
      <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {getApiError(query.error)}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(getTenantDashboardPath(`/salary?month=${month}`))}
      >
        <ArrowLeft className="h-4 w-4" />
        Salary
      </Button>

      {/* The email and push have already gone. WhatsApp needs a tap, because
          the message is sent from this browser rather than by the server. */}
      {pendingNotice && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Saved. Send {pendingNotice.what} on WhatsApp too?
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!pendingNotice.phone}
              onClick={() => {
                openWhatsApp(pendingNotice.text, pendingNotice.phone);
                setPendingNotice(null);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              {pendingNotice.phone ? "Send" : "No phone on file"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingNotice(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <AvatarTile
          person={{ name: data.member.name, avatarUrl: data.member.avatarUrl }}
          size="md"
          stacked
          className="h-14 w-14 rounded-xl"
        />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{data.member.name}</h1>
          <p className="text-sm text-muted-foreground">
            #{data.member.memberId} · {data.member.role}
          </p>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">{formatMonthLabel(month)}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => goMonth(1)}
          disabled={isCurrentMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* The agreed figure */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Monthly salary</CardTitle>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMonthly(String(data.compensation?.monthlyAmount ?? ""));
                setShowCompForm((v) => !v);
              }}
            >
              {data.compensation ? "Change" : "Set"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-2xl font-bold tabular-nums">
            {formatCurrency(data.compensation?.monthlyAmount ?? 0)}
          </p>

          {showCompForm && canManage && (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <div className="space-y-1">
                <Label htmlFor="monthly">Monthly amount (₹)</Label>
                <Input
                  id="monthly"
                  inputMode="numeric"
                  value={monthly}
                  onChange={(e) => setMonthly(e.target.value)}
                  placeholder="15000"
                />
                <p className="text-[11px] text-muted-foreground">
                  Months already recorded keep the figure they were opened with.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveCompensation} disabled={setCompensation.isPending}>
                  {setCompensation.isPending ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowCompForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!cycle ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {data.compensation
              ? "This month has not been opened yet. An admin opening it starts the payslip."
              : "Set a monthly salary above before recording pay."}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* What the month comes to */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This month</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base</span>
                <span className="tabular-nums">{formatCurrency(cycle.baseAmount)}</span>
              </div>
              {cycle.additions > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Additions</span>
                  <span className="tabular-nums">+ {formatCurrency(cycle.additions)}</span>
                </div>
              )}
              {cycle.deductions > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Deductions</span>
                  <span className="tabular-nums">− {formatCurrency(cycle.deductions)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Payable</span>
                <span className="tabular-nums">{formatCurrency(cycle.payable)}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Paid</span>
                <span className="tabular-nums">{formatCurrency(cycle.paid)}</span>
              </div>
              <div
                className={cn(
                  "flex justify-between font-semibold",
                  cycle.outstanding > 0 ? "text-amber-600" : "text-muted-foreground",
                )}
              >
                <span>Outstanding</span>
                <span className="tabular-nums">{formatCurrency(cycle.outstanding)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Bonus, incentive, benefit, deduction */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Additions &amp; deductions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cycle.components.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing added or taken off.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {cycle.components.map((component) => (
                    <li key={component.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{component.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {KINDS.find((k) => k.value === component.kind)?.label ?? component.kind}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-sm font-medium tabular-nums",
                          component.kind === "DEDUCTION" ? "text-red-600" : "text-emerald-600",
                        )}
                      >
                        {component.kind === "DEDUCTION" ? "−" : "+"}{" "}
                        {formatCurrency(component.amount)}
                      </span>
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 p-0 text-destructive"
                          onClick={async () => {
                            try {
                              await removeComponent.mutateAsync(component.id);
                              toast.success("Removed.");
                            } catch (err) {
                              toast.error(getApiError(err));
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canManage && (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="kind">Type</Label>
                      <select
                        id="kind"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={kind}
                        onChange={(e) => setKind(e.target.value as SalaryComponentKind)}
                      >
                        {KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="c-label">What for</Label>
                      <Input
                        id="c-label"
                        value={componentLabel}
                        onChange={(e) => setComponentLabel(e.target.value)}
                        placeholder="Festival bonus"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="c-amount">Amount (₹)</Label>
                      <Input
                        id="c-amount"
                        inputMode="numeric"
                        value={componentAmount}
                        onChange={(e) => setComponentAmount(e.target.value)}
                        placeholder="2000"
                      />
                    </div>
                  </div>
                  <Button size="sm" onClick={submitComponent} disabled={addComponent.isPending}>
                    <Plus className="h-4 w-4" />
                    {addComponent.isPending ? "Adding..." : "Add"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Money handed over */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cycle.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing paid yet this month.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {cycle.payments.map((payment) => (
                    <li key={payment.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium tabular-nums">
                          {formatCurrency(payment.amount)}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {payment.method} · {formatDate(payment.paidAt)}
                          {payment.recordedByName ? ` · by ${payment.recordedByName}` : ""}
                          {payment.note ? ` · ${payment.note}` : ""}
                        </p>
                      </div>
                      {canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 p-0 text-destructive"
                          onClick={async () => {
                            try {
                              await deletePayment.mutateAsync(payment.id);
                              toast.success("Payment removed, and its expense with it.");
                            } catch (err) {
                              toast.error(getApiError(err));
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canManage && cycle.outstanding > 0 && (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="p-amount">Amount (₹)</Label>
                      <Input
                        id="p-amount"
                        inputMode="numeric"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        placeholder={String(cycle.outstanding)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {formatCurrency(cycle.outstanding)} outstanding. Part payments are fine.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="p-method">Method</Label>
                      <select
                        id="p-method"
                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as SalaryPaymentMethod)}
                      >
                        {METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="p-note">Note</Label>
                      <Input
                        id="p-note"
                        value={payNote}
                        onChange={(e) => setPayNote(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={submitPayment} disabled={recordPayment.isPending}>
                      {recordPayment.isPending ? "Recording..." : "Record payment"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPayAmount(String(cycle.outstanding))}
                    >
                      Pay all
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
