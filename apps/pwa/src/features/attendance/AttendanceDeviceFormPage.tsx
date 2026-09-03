/**
 * Documentation: Add or edit an RFID attendance machine.
 *
 * - A page rather than a dialog. Registering a reader is a setup job done with the unit's label in hand — a serial read off the back of a box, a timezone, a location — and a modal makes that a cramped, interruptible transaction on a phone at the gym. It also gives the form its own URL, so half-finished work survives a reload and somebody can be sent straight to it.
 * - The serial is fixed once saved. It is what every punch is matched on, so changing it is registering a different machine, which is what adding one does.
 * - The device being edited is read from the list rather than fetched on its own: a gym has a handful of readers, the list is already cached, and a second endpoint for one row would be a route to keep in step for nothing.
 * - Primary exports: AttendanceDeviceFormPage.
 */
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Permission } from "@fitconnect/shared/types/permissions";
import { usePermissions } from "@/features/auth/permission-gate";
import {
  useAttendanceDevices,
  useCreateAttendanceDevice,
  useUpdateAttendanceDevice,
} from "@/api/queries/attendance";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft } from "lucide-react";

/** Zones a gym in India realistically runs a reader in, plus a way out. */
const COMMON_TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Kathmandu", "UTC"];

type DeviceForm = {
  serialNumber: string;
  name: string;
  location: string;
  timezone: string;
};

const EMPTY_FORM: DeviceForm = {
  serialNumber: "",
  name: "",
  location: "",
  timezone: "Asia/Kolkata",
};

export default function AttendanceDeviceFormPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { deviceId } = useParams<{ deviceId: string }>();
  const isEdit = Boolean(deviceId);

  const { can } = usePermissions();
  const canManage = can(Permission.ATTENDANCE_QR_MANAGE);

  const devicesQuery = useAttendanceDevices({ enabled: canManage });
  const createDevice = useCreateAttendanceDevice();
  const updateDevice = useUpdateAttendanceDevice();

  /**
   * The edits made so far, or nothing yet.
   *
   * Derived rather than copied in an effect. The device arrives asynchronously,
   * so an effect would have to seed the form once it lands and then guard
   * against re-seeding over whatever had been typed since — two renders and a
   * flag to get right. Holding only the changes and falling back to the saved
   * row needs neither: before the first keystroke the form *is* the device, and
   * after it, it is the draft.
   */
  const [draft, setDraft] = React.useState<DeviceForm | null>(null);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState("");

  const existing = React.useMemo(
    () => (devicesQuery.data ?? []).find((device) => device.id === deviceId) ?? null,
    [devicesQuery.data, deviceId],
  );

  const form: DeviceForm =
    draft ??
    (existing
      ? {
          serialNumber: existing.serialNumber,
          name: existing.name,
          location: existing.location ?? "",
          timezone: existing.timezone,
        }
      : EMPTY_FORM);

  const update = (patch: Partial<DeviceForm>) => setDraft({ ...form, ...patch });

  const save = async () => {
    setWorking(true);
    setError("");

    try {
      if (isEdit && deviceId) {
        await updateDevice.mutateAsync({
          deviceId,
          data: {
            name: form.name.trim(),
            location: form.location.trim() || null,
            timezone: form.timezone.trim(),
          },
        });
        toast.success("Device updated.");
      } else {
        await createDevice.mutateAsync({
          serialNumber: form.serialNumber.trim(),
          name: form.name.trim(),
          ...(form.location.trim() ? { location: form.location.trim() } : {}),
          timezone: form.timezone.trim(),
        });
        toast.success("Device registered. It will show as online once it checks in.");
      }
      navigate("/attendance/devices");
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  if (!canManage) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            You do not have permission to manage attendance machines.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isEdit && devicesQuery.isPending) {
    return <FormPageSkeleton />;
  }

  if (isEdit && !existing && !devicesQuery.isPending) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">That machine no longer exists.</p>
          <Button variant="outline" onClick={() => navigate("/attendance/devices")}>
            <ArrowLeft className="h-4 w-4" />
            Back to machines
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canSave =
    !working && form.name.trim().length >= 2 && (isEdit || form.serialNumber.trim().length >= 3);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Edit machine" : "Add machine"}
          </h1>
          <p className="text-muted-foreground">
            {isEdit
              ? "The serial cannot change — it is what every punch is matched on."
              : "Register a reader so its check-ins are accepted for this gym."}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/attendance/devices")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Device details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="serialNumber">Serial number *</Label>
            <Input
              id="serialNumber"
              value={form.serialNumber}
              disabled={isEdit}
              placeholder="e.g. CGT9234500123"
              className="font-mono"
              onChange={(e) => update({ serialNumber: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Printed on the back of the unit, and shown in its own network menu.
              Until a serial is registered here, anything that device sends is ignored.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deviceName">Name *</Label>
            <Input
              id="deviceName"
              value={form.name}
              placeholder="Front door reader"
              onChange={(e) => update({ name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deviceLocation">Location</Label>
            <Input
              id="deviceLocation"
              value={form.location}
              placeholder="Entrance"
              onChange={(e) => update({ location: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deviceTimezone">Clock timezone *</Label>
            <Input
              id="deviceTimezone"
              list="device-timezones"
              value={form.timezone}
              placeholder="Asia/Kolkata"
              onChange={(e) => update({ timezone: e.target.value })}
            />
            <datalist id="device-timezones">
              {COMMON_TIMEZONES.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              The machine reports the time on its own clock with no timezone
              attached, so this is what decides which day a check-in is filed
              under. Get it wrong and an early-morning session lands on
              yesterday.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => navigate("/attendance/devices")}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={!canSave}>
              {working ? "Saving…" : isEdit ? "Save changes" : "Register machine"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!isEdit && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">After you save</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              On the device, point its server address at this app&apos;s API host
              and turn on the cloud or ADMS option. It checks in within a minute
              and this page will show it as online.
            </p>
            <p>
              Every member who already has a card is queued to the new reader
              automatically, so nobody needs re-enrolling at its keypad.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
