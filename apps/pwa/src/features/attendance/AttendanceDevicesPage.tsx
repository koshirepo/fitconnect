/**
 * Documentation: RFID attendance machines.
 *
 * - Where a gym registers the readers on its walls. Registration is not bookkeeping: the punch endpoint accepts a machine precisely because its serial appears here, so adding a row is what authorises a device to write attendance for this gym.
 * - The serial is the one field that cannot be edited afterwards. It is what every punch is matched on, so changing it is registering a different machine — which is what adding one does.
 * - Online is read from when the device last spoke, not from a stored flag, and the list refreshes on its own. A machine that has been unplugged says so within a minute or two rather than looking healthy forever.
 * - Deactivating is offered beside deleting because they differ: a deactivated device stays registered and its punches are ignored, which is what you want for a unit that is away being repaired. Deleting frees the serial for another gym.
 * - Primary exports: AttendanceDevicesPage.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Permission } from "@fitconnect/shared/types/permissions";
import { usePermissions } from "@/features/auth/permission-gate";
import {
  useAttendanceDevices,
  useDeleteAttendanceDevice,
  useUpdateAttendanceDevice,
} from "@/api/queries/attendance";
import { getApiError } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import { ArrowLeft, Plus, Power, Radio, Trash2, Wifi, WifiOff } from "lucide-react";
import type { AttendanceDevice } from "@/types/api";

export default function AttendanceDevicesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can(Permission.ATTENDANCE_QR_MANAGE);

  const devicesQuery = useAttendanceDevices({ enabled: canManage });
  const updateDevice = useUpdateAttendanceDevice();
  const deleteDevice = useDeleteAttendanceDevice();

  const [removing, setRemoving] = React.useState<AttendanceDevice | null>(null);
  const [working, setWorking] = React.useState(false);

  const devices = devicesQuery.data ?? [];

  // Adding and editing are their own pages: a serial is copied off a label
  // with the unit in hand, which is a poor fit for a modal on a phone, and a
  // real URL means half-finished work survives a reload.
  const openCreate = () => navigate("/attendance/devices/new");
  const openEdit = (device: AttendanceDevice) =>
    navigate(`/attendance/devices/${device.id}/edit`);

  const toggleActive = async (device: AttendanceDevice) => {
    try {
      await updateDevice.mutateAsync({
        deviceId: device.id,
        data: { isActive: !device.isActive },
      });
      toast.success(device.isActive ? "Device deactivated." : "Device activated.");
    } catch (err: unknown) {
      toast.error(getApiError(err));
    }
  };

  const remove = async () => {
    if (!removing) return;
    setWorking(true);
    try {
      await deleteDevice.mutateAsync(removing.id);
      setRemoving(null);
      toast.success("Device removed.");
    } catch (err: unknown) {
      toast.error(getApiError(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance machines</h1>
          <p className="text-muted-foreground">
            RFID readers that check members in. A gym can have as many as it has doors.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/attendance")}>
            <ArrowLeft className="h-4 w-4" />
            Attendance
          </Button>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add machine
            </Button>
          )}
        </div>
      </div>

      {!canManage ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              You do not have permission to manage attendance machines.
            </p>
          </CardContent>
        </Card>
      ) : devicesQuery.isPending ? (
        <ListPageSkeleton search={false} filters={0} />
      ) : devices.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No machines registered"
          description="Register a reader with the serial number printed on the back of the unit. Until it is registered, anything it sends is ignored."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add machine
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {devices.map((device) => (
            <Card key={device.id} className={device.isActive ? undefined : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{device.name}</CardTitle>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {device.serialNumber}
                    </p>
                    {device.location && (
                      <p className="text-sm text-muted-foreground">{device.location}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {device.online ? (
                      <Badge variant="success" className="gap-1">
                        <Wifi className="h-3 w-3" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <WifiOff className="h-3 w-3" />
                        Offline
                      </Badge>
                    )}
                    {!device.isActive && <Badge variant="destructive">Deactivated</Badge>}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-sm">
                <div className="space-y-1 text-xs text-muted-foreground">
                  {/* Last seen and last punch are separate because these devices
                      poll constantly: one says the machine is plugged in, the
                      other says the door is being used. */}
                  <p>
                    Last heard from:{" "}
                    {device.lastSeenAt ? formatDateTime(device.lastSeenAt) : "never"}
                  </p>
                  <p>
                    Last check-in:{" "}
                    {device.lastPunchAt ? formatDateTime(device.lastPunchAt) : "none yet"}
                  </p>
                  <p>Clock: {device.timezone}</p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(device)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void toggleActive(device)}>
                    <Power className="h-4 w-4" />
                    {device.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRemoving(device)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canManage && devices.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pointing a machine at this gym</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              On the device, set the server address to this app&apos;s API host and
              the port it is served on, leave the path at its default, and turn on
              the cloud or ADMS option. It will check in within a minute.
            </p>
            <p>
              Then enrol each member&apos;s card on the machine and record the PIN it
              was enrolled under against that member — a punch carries the PIN, not
              the card number, so an unmapped PIN is counted and ignored.
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove this machine?"
        description="Its check-ins already recorded are kept. The serial becomes free to register again, here or at another gym, and anything the device sends from now on is ignored."
        confirmLabel="Remove"
        loading={working}
        onConfirm={remove}
      />
    </div>
  );
}
