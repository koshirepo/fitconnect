/**
 * Documentation: Pausing a membership.
 *
 * - Shows what a member has left to freeze and lets someone arrange one. Used on the member's own profile and on the staff-facing member page, because the action is the same either way — only who may reach it differs, and the API decides that.
 * - The budget comes from the plan, so this reads it rather than assuming: a plan with no freeze days simply says so and offers nothing.
 * - Ending a freeze early returns the unused days, and the card says how many came back — otherwise "unfreeze" looks like it cost the member their whole booking.
 * - Primary exports: FreezeCard.
 */
import * as React from "react";
import { useCreateFreeze, useEndFreeze, useFreezeStatus } from "@/api/queries/freezes";
import { getApiError } from "@/api/client";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Pause, Play, Snowflake } from "lucide-react";

const MIN_FREEZE_DAYS = 3;

export function FreezeCard({
  membershipId,
  /** Staff see the reason field and can act on someone else's membership. */
  isStaff = false,
}: {
  membershipId: string;
  isStaff?: boolean;
}) {
  const toast = useToast();
  const statusQuery = useFreezeStatus(membershipId);
  const createFreeze = useCreateFreeze();
  const endFreeze = useEndFreeze();

  const status = statusQuery.data;

  const [open, setOpen] = React.useState(false);
  const [startsOn, setStartsOn] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [days, setDays] = React.useState(String(MIN_FREEZE_DAYS));
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  if (statusQuery.isLoading || !status) return null;

  // A plan with no freeze budget has nothing to say here.
  if (!status.canFreeze && !status.currentFreeze && !status.scheduledFreeze) return null;

  /**
   * Frozen today, or only booked to be.
   *
   * The card used to treat both as "Frozen", because the API reported a freeze
   * booked for next month as the current one. A member who has arranged a break
   * for December is training now, and telling them they are paused — while the
   * rest of the app correctly lets them buy a new term — is the app
   * contradicting itself.
   */
  const running = status.currentFreeze;
  const booked = running ? null : (status.scheduledFreeze ?? null);
  const pending = running ?? booked;

  const requestedDays = Number(days) || 0;
  const overBudget = requestedDays > status.remainingDays;
  const tooShort = requestedDays < MIN_FREEZE_DAYS;
  const outOfFreezes = status.usedFreezes >= status.allowedFreezes;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const result = await createFreeze.mutateAsync({
        membershipId,
        startsOn,
        days: requestedDays,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success(
        `Frozen for ${requestedDays} days. Membership now runs to ${formatDate(result.newTermEndsOn)}.`,
      );
      setOpen(false);
      setReason("");
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleEnd = async () => {
    if (!pending) return;

    try {
      const result = await endFreeze.mutateAsync({ freezeId: pending.id });
      // Cancelling a freeze that never started returns every booked day, so
      // the wording has to survive both cases.
      toast.success(
        result.daysReturned > 0
          ? `${booked ? "Cancelled" : "Unfrozen"}. ${result.daysReturned} unused day${
              result.daysReturned === 1 ? "" : "s"
            } went back to their allowance.`
          : booked
            ? "Freeze cancelled."
            : "Unfrozen.",
      );
    } catch (caught) {
      toast.error({
        message: booked ? "Could not cancel the freeze." : "Could not unfreeze.",
        description: getApiError(caught),
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5" />
            {running ? "Frozen" : booked ? "Freeze booked" : "Freeze membership"}
          </CardTitle>
          <CardDescription>
            {running
              ? `Paused until ${formatDate(running.plannedEndsOn)}. The days are added to the end of the term.`
              : booked
                ? `Starts ${formatDate(booked.startsOn)}. Still training until then.`
                : `${status.remainingDays} of ${status.allowanceDays} days left on this term.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {pending ? (
            <>
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{running ? "Started" : "Starts"}</span>
                  <span>{formatDate(pending.startsOn)}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Booked until</span>
                  <span>{formatDate(pending.plannedEndsOn)}</span>
                </div>
                {status.termEndsOn && (
                  <div className="mt-1 flex justify-between border-t pt-1 font-medium">
                    <span>Membership now runs to</span>
                    <span>{formatDate(status.termEndsOn)}</span>
                  </div>
                )}
              </div>

              <Button variant="outline" className="w-full" onClick={handleEnd}>
                <Play className="mr-2 h-4 w-4" />
                {running ? "Unfreeze now" : "Cancel this freeze"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {running
                  ? "Any days not used go back to the allowance."
                  : "Cancelling returns all booked days to the allowance."}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {status.usedFreezes} of {status.allowedFreezes} freeze
                {status.allowedFreezes === 1 ? "" : "s"} used on this term.
              </p>

              <Button
                className="w-full"
                onClick={() => setOpen(true)}
                disabled={status.remainingDays < MIN_FREEZE_DAYS || outOfFreezes}
              >
                <Pause className="mr-2 h-4 w-4" />
                Freeze
              </Button>

              {outOfFreezes && (
                <p className="text-xs text-muted-foreground">
                  This term's freezes are used up. The allowance resets on renewal.
                </p>
              )}
              {!outOfFreezes && status.remainingDays < MIN_FREEZE_DAYS && (
                <p className="text-xs text-muted-foreground">
                  A freeze is at least {MIN_FREEZE_DAYS} days, and only{" "}
                  {status.remainingDays} left on this term.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Freeze membership</DialogTitle>
            <DialogDescription>
              The days are added to the end of the term — nothing is lost, and
              nothing is refunded.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="freeze-start">Starts</Label>
                <Input
                  id="freeze-start"
                  type="date"
                  value={startsOn}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setStartsOn(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="freeze-days">Days</Label>
                <Input
                  id="freeze-days"
                  type="number"
                  min={MIN_FREEZE_DAYS}
                  max={status.remainingDays}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {MIN_FREEZE_DAYS}–{status.remainingDays} days
                </p>
              </div>
            </div>

            {isStaff && (
              <div className="space-y-2">
                <Label htmlFor="freeze-reason">Reason</Label>
                <Input
                  id="freeze-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Travel, injury, exams…"
                  maxLength={200}
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || tooShort || overBudget}>
                {saving ? "Freezing…" : `Freeze for ${requestedDays} days`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
