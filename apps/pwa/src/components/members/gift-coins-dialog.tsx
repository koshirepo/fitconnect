/**
 * Documentation: Giving a member coins, or taking them back.
 *
 * - The API for this has existed since coupons did; there was simply no way to reach it without curl. This is that endpoint, in a dialog, from the member's own page where the balance is already shown.
 * - Give and take are one control with a sign, not two buttons. The ledger stores a signed amount and a correction is the same act as a gift; splitting them into separate flows would mean two ways to write one kind of row.
 * - The note is required, and the API requires it too. A balance that moved for no stated reason is one nobody can defend when the member asks why, and "the system did it" is not an answer a front desk can give.
 * - Shows what the balance will become before it is committed. Somebody typing 500 into a box has not necessarily worked out that the member ends on 1,200.
 * - Primary exports: GiftCoinsDialog.
 */
import * as React from "react";
import { Coins, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdjustCoins } from "@/api/queries/coupons";
import { getApiError } from "@/api/client";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function GiftCoinsDialog({
  membershipId,
  memberName,
  balance,
  open,
  onOpenChange,
}: {
  membershipId: string;
  memberName: string;
  balance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const adjust = useAdjustCoins(membershipId);

  const [direction, setDirection] = React.useState<"GIVE" | "TAKE">("GIVE");
  const [amount, setAmount] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");

  const parsed = Number.parseInt(amount, 10);
  const magnitude = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const signed = direction === "GIVE" ? magnitude : -magnitude;
  const nextBalance = balance + signed;

  const reset = () => {
    setDirection("GIVE");
    setAmount("");
    setNote("");
    setError("");
  };

  const submit = async () => {
    if (magnitude <= 0) {
      setError("Enter how many coins.");
      return;
    }
    if (!note.trim()) {
      setError("Say why. The member can see this.");
      return;
    }
    // Taking more than somebody holds would leave a negative balance, which the
    // rest of the app has no way to spend down.
    if (nextBalance < 0) {
      setError(`${memberName} only has ${balance} coins.`);
      return;
    }

    setError("");
    try {
      await adjust.mutateAsync({ amount: signed, note: note.trim() });
      toast.success(
        direction === "GIVE"
          ? `Gave ${magnitude} coins to ${memberName}.`
          : `Took ${magnitude} coins back.`,
      );
      reset();
      onOpenChange(false);
    } catch (caught) {
      setError(getApiError(caught));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Coins for {memberName}</DialogTitle>
          <DialogDescription>
            Holding {balance.toLocaleString("en-IN")} coins. Spendable on a subscription or in
            the gym store.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={direction === "GIVE" ? "default" : "outline"}
              onClick={() => setDirection("GIVE")}
            >
              <Plus className="h-4 w-4" />
              Give
            </Button>
            <Button
              type="button"
              variant={direction === "TAKE" ? "default" : "outline"}
              onClick={() => setDirection("TAKE")}
            >
              <Minus className="h-4 w-4" />
              Take back
            </Button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="coin-amount">How many</Label>
              {/* Clearing a balance is the common correction — a member leaving,
                  or a gift given to the wrong person — and typing the exact
                  figure to do it invites an off-by-one that has to be corrected
                  in turn. */}
              {direction === "TAKE" && balance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(balance))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Take all {balance.toLocaleString("en-IN")}
                </button>
              )}
            </div>
            <Input
              id="coin-amount"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="500"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coin-note">Why</Label>
            <Textarea
              id="coin-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Referred three friends this month"
              rows={2}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Kept on the ledger. The member can see it.
            </p>
          </div>

          {magnitude > 0 && (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <Coins className="h-4 w-4 text-muted-foreground" />
              <span>
                Balance becomes{" "}
                <strong className={cn(nextBalance < 0 && "text-destructive")}>
                  {nextBalance.toLocaleString("en-IN")}
                </strong>
                {nextBalance === 0 && direction === "TAKE" && (
                  <span className="text-muted-foreground"> — cleared</span>
                )}
              </span>
            </div>
          )}

          {/* Said plainly, because it is the reassurance somebody needs before
              taking money-like value off a member. */}
          <p className="text-xs text-muted-foreground">
            Either way this is written to the gym&rsquo;s coin ledger with your name
            against it, and shows on the Coins page.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={adjust.isPending}>
            {adjust.isPending ? "Saving…" : direction === "GIVE" ? "Give coins" : "Take back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
