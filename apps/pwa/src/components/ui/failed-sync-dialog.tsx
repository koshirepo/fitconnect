/**
 * Documentation: What happened to the changes that never synced.
 *
 * - Offline writes that the server refused, or that ran out of retries, used to be deleted with only a line in the console. Someone who added five members on a bad connection could lose one and never find out. They are kept now, and this is where they surface.
 * - Every row offers the only two honest options: try it again, or discard it deliberately. Nothing disappears without a person choosing it.
 * - Retrying reuses the write's original idempotency key, so a change that did reach the server before the connection dropped still cannot be applied twice.
 * - Primary exports: FailedSyncDialog.
 */
import * as React from "react";
import {
  discardMutation,
  getFailedMutations,
  retryMutation,
  flushPendingMutations,
} from "@/lib/sync-engine";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

type FailedMutation = Awaited<ReturnType<typeof getFailedMutations>>[number];

/** "POST /tenants/x/members" reads as nothing; this names the actual change. */
function describeMutation(mutation: FailedMutation) {
  const url = mutation.url;
  if (url.includes("/payments")) return "Payment";
  if (url.includes("/members")) return "Member";
  if (url.includes("/attendance")) return "Attendance";
  if (url.includes("/badges")) return "Badge";
  if (url.includes("/todos")) return "Task";

  const method = mutation.method === "POST" ? "New" : "Updated";
  return `${method} record`;
}

/** The name the person typed, when the queued body still has it. */
function describeSubject(mutation: FailedMutation) {
  if (!mutation.body) return null;
  try {
    const body = JSON.parse(mutation.body) as Record<string, unknown>;
    const name = body.name ?? body._memberName;
    if (typeof name === "string" && name) return name;
    if (typeof body.amount === "number") return `₹${body.amount}`;
  } catch {
    // A body that will not parse tells us nothing; the label alone will do.
  }
  return null;
}

export function FailedSyncDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a retry or a discard so the status pill can recount. */
  onChanged?: () => void;
}) {
  const [items, setItems] = React.useState<FailedMutation[]>([]);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setItems(await getFailedMutations());
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleRetry = async (id: number) => {
    setBusyId(id);
    try {
      await retryMutation(id);
      await flushPendingMutations();
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscard = async (id: number) => {
    setBusyId(id);
    try {
      await discardMutation(id);
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Changes that didn't save
          </DialogTitle>
          <DialogDescription>
            These were made while offline and the server would not accept them.
            They are still here — nothing was thrown away.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-3 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing failed. Everything you changed has saved.
            </p>
          ) : (
            items.map((item) => {
              const subject = describeSubject(item);
              return (
                <div key={item.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {describeMutation(item)}
                        {subject ? ` — ${subject}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.error ?? "The server rejected this change."}
                      </p>
                      {item.failedAt && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(item.failedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === item.id}
                        onClick={() => item.id != null && handleRetry(item.id)}
                        title="Try again"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === item.id}
                        onClick={() => item.id != null && handleDiscard(item.id)}
                        title="Discard this change"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
