/**
 * Documentation: Role permission editor.
 *
 * - Renders one role's capability checklist, grouped by resource, and reports the pending selection back to the page that owns saving.
 * - Locked permissions render checked and disabled; non-manageable ones render disabled with a note, so the guardrails the API enforces are visible rather than surprising.
 * - Primary exports: RolePermissionEditor.
 */
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck } from "lucide-react";
import type { RoleMatrixEntry, RolePermissionCatalogGroup } from "@/api/roles";
import { cn } from "@/lib/utils";

type Props = {
  role: RoleMatrixEntry;
  catalog: RolePermissionCatalogGroup[];
  selected: Set<string>;
  onToggle: (permission: string, next: boolean) => void;
  onToggleGroup: (permissions: string[], next: boolean) => void;
  disabled?: boolean;
};

export function RolePermissionEditor({
  role,
  catalog,
  selected,
  onToggle,
  onToggleGroup,
  disabled = false,
}: Props) {
  const locked = React.useMemo(() => new Set(role.lockedPermissions), [role.lockedPermissions]);
  const baseline = React.useMemo(
    () => new Set(role.baselinePermissions),
    [role.baselinePermissions],
  );
  // Custom roles have an empty catalog baseline by design, so the "changed"
  // badge (which compares against the baseline) is meaningless for them.
  const showDeviations = role.isSystem;

  return (
    <div className="space-y-6">
      {catalog.map((group) => {
        const editable = group.permissions.filter(
          (permission) => permission.manageable && !locked.has(permission.key),
        );
        const allSelected =
          editable.length > 0 && editable.every((permission) => selected.has(permission.key));

        return (
          <div key={group.key} className="space-y-2">
            <div className="flex items-center justify-between gap-2 border-b pb-1">
              <p className="text-sm font-semibold">{group.label}</p>
              {editable.length > 0 && !disabled && role.editable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onToggleGroup(
                      editable.map((permission) => permission.key),
                      !allSelected,
                    )
                  }
                >
                  {allSelected ? "Clear all" : "Select all"}
                </Button>
              )}
            </div>

            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {group.permissions.map((permission) => {
                const isLocked = locked.has(permission.key);
                const isChecked = isLocked || selected.has(permission.key);
                const isDisabled =
                  disabled || !role.editable || isLocked || !permission.manageable;
                const deviates = showDeviations && isChecked !== baseline.has(permission.key);

                return (
                  <label
                    key={permission.key}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      !isDisabled && "hover:bg-muted/50",
                      isDisabled && "opacity-60",
                    )}
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={isChecked}
                      disabled={isDisabled}
                      onCheckedChange={(next) => onToggle(permission.key, Boolean(next))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{permission.label}</span>
                        {isLocked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                        {deviates && (
                          <Badge variant="warning" className="shrink-0">
                            changed
                          </Badge>
                        )}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {permission.key}
                      </span>
                      {!permission.manageable && (
                        <span className="block text-[11px] text-muted-foreground">
                          Managed at the platform level
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {!role.editable && (
        <p className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {role.label} always holds every permission and cannot be edited.
        </p>
      )}
    </div>
  );
}
