/**
 * Documentation: The RFID card a member carries.
 *
 * - Assigning a card is done here rather than at the machine's keypad. The app pushes the enrolment to every reader the gym has, so a card entered once works at every door — where enrolling on the device means doing it again at each one, and explains cards that open the entrance but not the studio.
 * - The PIN defaults to the member's own number. The machines report a PIN on every punch and it has to be unique per gym, which is exactly what the member number already is — so there is no second numbering scheme to invent or keep in step.
 * - Removing a card withdraws it from the readers as well as clearing it here. A card left on a device keeps opening doors for somebody who no longer has a membership, which is the failure worth being careful about.
 * - Primary exports: MemberRfidCard.
 */
import * as React from "react";
import { Permission } from "@fitconnect/shared/types/permissions";
import { usePermissions } from "@/features/auth/permission-gate";
import { useAssignMemberCard } from "@/api/queries/attendance";
import { getApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { CreditCard, Trash2 } from "lucide-react";

type Props = {
  membershipId: string;
  memberId: number;
  deviceUserPin?: number | null;
  rfidCardNumber?: string | null;
  /** Redraw the member once the card changes. */
  onChanged?: () => void;
};

export function MemberRfidCard({
  membershipId,
  memberId,
  deviceUserPin,
  rfidCardNumber,
  onChanged,
}: Props) {
  const toast = useToast();
  const { can } = usePermissions();
  const canAssign = can(Permission.MEMBERS_UPDATE);
  const assignCard = useAssignMemberCard();

  const assigned = deviceUserPin != null;

  const [editing, setEditing] = React.useState(false);
  const [cardNumber, setCardNumber] = React.useState("");
  const [pin, setPin] = React.useState("");
  /**
   * Whether the operator has asked to set the machine PIN by hand.
   *
   * Hidden by default because it is the hardware's business, not the desk's:
   * these readers store people by a numeric id and report it on every punch,
   * and since the app enrols the card onto them it can choose that id itself.
   * Somebody being asked for it has been handed an implementation detail — and
   * the one person who needs it is the exception: a member already enrolled on
   * the device under a number the app did not pick.
   */
  const [overridePin, setOverridePin] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState("");

  const open = () => {
    setCardNumber(rfidCardNumber ?? "");
    // The member's own number, which is already unique in this gym.
    setPin(String(deviceUserPin ?? memberId));
    setError("");
    // Revealed only when the member already carries a number the app would not
    // have chosen, which is the case where it actually matters.
    setOverridePin(deviceUserPin != null && deviceUserPin !== memberId);
    setEditing(true);
  };

  const save = async () => {
    setWorking(true);
    setError("");
    try {
      await assignCard.mutateAsync({
        membershipId,
        deviceUserPin: Number(pin),
        rfidCardNumber: cardNumber.trim() || null,
      });
      toast.success("Card assigned. It is being pushed to every reader.");
      setEditing(false);
      onChanged?.();
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    setWorking(true);
    try {
      await assignCard.mutateAsync({
        membershipId,
        deviceUserPin: null,
        rfidCardNumber: null,
      });
      toast.success("Card removed and withdrawn from the readers.");
      setEditing(false);
      onChanged?.();
    } catch (err: unknown) {
      toast.error(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Attendance card
          </CardTitle>
          {assigned ? (
            <Badge variant="success">Assigned</Badge>
          ) : (
            <Badge variant="secondary">Not assigned</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {!editing ? (
          <>
            {assigned ? (
              <div className="space-y-1">
                <p>
                  Card{" "}
                  <span className="font-mono">{rfidCardNumber ?? "—"}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Filed on the readers as #{deviceUserPin}.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                This member has no card. Assign one and it is enrolled on every
                reader automatically — there is no need to go to the machine.
              </p>
            )}

            {canAssign && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={open}>
                  {assigned ? "Change card" : "Assign card"}
                </Button>
                {assigned && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() => void remove()}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Remove
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="rfidCardNumber">Card number</Label>
              <Input
                id="rfidCardNumber"
                value={cardNumber}
                className="font-mono"
                placeholder="Number printed on the card"
                onChange={(e) => setCardNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Read it off the card, or tap the card on a reader in enrol mode
                and copy the number it shows.
              </p>
            </div>

            {overridePin ? (
              <div className="space-y-2">
                <Label htmlFor="devicePin">Machine ID</Label>
                <Input
                  id="devicePin"
                  type="number"
                  min={1}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The number the readers file this member under. Only change it
                  to match an enrolment already on the machine — otherwise their
                  taps arrive under a number nobody here recognises.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The readers will file this member under{" "}
                <span className="font-medium text-foreground">#{pin}</span>,
                their own member number.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setOverridePin(true)}
                >
                  Use a different number
                </button>{" "}
                only if they are already enrolled on the machine.
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={working || !pin || Number(pin) < 1}
                onClick={() => void save()}
              >
                {working ? "Saving…" : "Save card"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
