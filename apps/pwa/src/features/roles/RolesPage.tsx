/**
 * Documentation: Role and permission management screen.
 *
 * - Shared by the gym-level view (`scope="tenant"`, editing MEMBER/COACH/ADMIN for the signed-in gym) and the platform-level view (`scope="platform"`, editing platform roles plus the tenant-role defaults every gym inherits).
 * - Data flows through TanStack Query so the matrix is cached, deduped, and invalidated together with `/auth/me` whenever a policy changes.
 * - Primary exports: default export.
 */
import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { getApiError } from "@/api/client";
import {
  useDeletePlatformRole,
  useDeleteTenantRole,
  usePlatformRoleMatrix,
  useResetPlatformRole,
  useResetTenantRole,
  useTenantRoleMatrix,
  useUpdatePlatformRole,
  useUpdateTenantRole,
} from "@/api/queries/roles";
import type { RoleMatrixEntry } from "@/api/roles";
import type { PermissionScope } from "@fitconnect/shared/types/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldCheck, RotateCcw, Save, Users, Plus, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { RolePermissionEditor } from "./RolePermissionEditor";

type Props = {
  scope: "tenant" | "platform";
};

function roleKey(role: RoleMatrixEntry) {
  return `${role.scope}:${role.role}`;
}

export default function RolesPage({ scope }: Props) {
  const navigate = useAppNavigate();
  const { currentTenantId } = useAuthStore();
  const isPlatform = scope === "platform";
  const newRolePath = isPlatform ? "/platform-roles/new" : "/settings/roles/new";

  const tenantQuery = useTenantRoleMatrix(isPlatform ? null : currentTenantId);
  const platformQuery = usePlatformRoleMatrix(isPlatform);
  const query = isPlatform ? platformQuery : tenantQuery;

  const updateTenant = useUpdateTenantRole(currentTenantId);
  const resetTenant = useResetTenantRole(currentTenantId);
  const deleteTenant = useDeleteTenantRole(currentTenantId);
  const updatePlatform = useUpdatePlatformRole();
  const resetPlatform = useResetPlatformRole();
  const deletePlatform = useDeletePlatformRole();

  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  const matrix = query.data;
  const roles = React.useMemo(() => matrix?.roles ?? [], [matrix]);

  const activeRole = React.useMemo(
    () => roles.find((role) => roleKey(role) === activeKey) ?? roles[0],
    [roles, activeKey],
  );

  // Reset the working selection whenever the server matrix or the active role
  // changes, so an edit never carries over onto a different role.
  React.useEffect(() => {
    if (!activeRole) return;
    setSelected(new Set(activeRole.permissions));
  }, [activeRole]);

  const dirty = React.useMemo(() => {
    if (!activeRole) return false;
    const current = new Set(activeRole.permissions);
    if (current.size !== selected.size) return true;
    for (const permission of selected) {
      if (!current.has(permission)) return true;
    }
    return false;
  }, [activeRole, selected]);

  const saving =
    updateTenant.isPending ||
    updatePlatform.isPending ||
    resetTenant.isPending ||
    resetPlatform.isPending;

  function toggle(permission: string, next: boolean) {
    setSuccessMsg("");
    setSelected((prev) => {
      const draft = new Set(prev);
      if (next) draft.add(permission);
      else draft.delete(permission);
      return draft;
    });
  }

  function toggleGroup(permissions: string[], next: boolean) {
    setSuccessMsg("");
    setSelected((prev) => {
      const draft = new Set(prev);
      for (const permission of permissions) {
        if (next) draft.add(permission);
        else draft.delete(permission);
      }
      return draft;
    });
  }

  async function handleSave() {
    if (!activeRole) return;
    setError("");
    setSuccessMsg("");

    try {
      if (isPlatform) {
        await updatePlatform.mutateAsync({
          scope: activeRole.scope as PermissionScope,
          role: activeRole.role,
          permissions: [...selected],
        });
      } else {
        await updateTenant.mutateAsync({
          role: activeRole.role,
          permissions: [...selected],
        });
      }
      setSuccessMsg(`${activeRole.label} permissions saved.`);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  async function handleReset() {
    if (!activeRole) return;
    setConfirmOpen(false);
    setError("");
    setSuccessMsg("");

    try {
      if (isPlatform) {
        await resetPlatform.mutateAsync({
          scope: activeRole.scope as PermissionScope,
          role: activeRole.role,
        });
      } else {
        await resetTenant.mutateAsync(activeRole.role);
      }
      setSuccessMsg(`${activeRole.label} restored to defaults.`);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  async function handleDelete() {
    if (!activeRole) return;
    setConfirmDeleteOpen(false);
    setError("");
    setSuccessMsg("");

    try {
      if (isPlatform) {
        await deletePlatform.mutateAsync({
          scope: activeRole.scope as PermissionScope,
          role: activeRole.role,
        });
      } else {
        await deleteTenant.mutateAsync(activeRole.role);
      }
      setActiveKey(null);
      setSuccessMsg(`Role "${activeRole.label}" deleted.`);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  const deleting = deleteTenant.isPending || deletePlatform.isPending;

  if (!isPlatform && !currentTenantId) {
    return (
      <EmptyState
        icon={Users}
        title="No gym selected"
        description="Role permissions are managed per gym. Sign in to a gym to continue."
      />
    );
  }

  // Header, then the roles list beside the permission matrix — the page's real
  // two-column shape, not the stacked form fields a form skeleton would draw.
  if (query.isLoading) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <PageHeaderSkeleton />
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Could not load roles"
        description={getApiError(query.error)}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-6 w-6" />
            {isPlatform ? "Platform Roles & Permissions" : "Roles & Permissions"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPlatform
              ? "Set what each platform role can do, and the defaults every gym inherits for its own roles."
              : "Choose what each role can do inside your gym. Changes apply to everyone holding that role."}
          </p>
        </div>
        <Button type="button" onClick={() => navigate(newRolePath)}>
          <Plus className="h-4 w-4" />
          New Role
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {successMsg && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{successMsg}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Role list */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Roles</CardTitle>
            <CardDescription>
              {isPlatform ? "Platform and default gym roles" : "Roles in your gym"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {roles.map((role) => {
              const isActive = activeRole && roleKey(role) === roleKey(activeRole);
              return (
                <div
                  key={roleKey(role)}
                  className={cn(
                    "group flex w-full items-center gap-1 rounded-md transition-colors",
                    isActive && "bg-primary/10",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveKey(roleKey(role));
                      setError("");
                      setSuccessMsg("");
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{role.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {isPlatform ? `${role.scope.toLowerCase()} · ` : ""}
                        {role.permissions.length} permissions
                        {!role.isSystem ? " · custom" : ""}
                      </span>
                      {role.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {role.description}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {role.customized && <Badge variant="warning">custom</Badge>}
                      {!role.editable && <Badge variant="secondary">fixed</Badge>}
                      {!role.isSystem && (
                        <>
                          <button
                            type="button"
                            title={`Edit ${role.label}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(
                                isPlatform
                                  ? `/platform-roles/${role.role}/edit`
                                  : `/settings/roles/${role.role}/edit`,
                              );
                            }}
                            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title={`Delete ${role.label}`}
                            disabled={deleting}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveKey(roleKey(role));
                              setConfirmDeleteOpen(true);
                            }}
                            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Permission checklist */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle className="text-base">{activeRole?.label ?? "Select a role"}</CardTitle>
              <CardDescription>
                {activeRole
                  ? `${selected.size} of ${matrix?.catalog.reduce((total, group) => total + group.permissions.length, 0) ?? 0} permissions granted`
                  : "Pick a role to review its permissions."}
              </CardDescription>
            </div>
            {activeRole?.editable && (
              <div className="flex shrink-0 items-center gap-2">
                {!activeRole.isSystem && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || deleting}
                      onClick={() =>
                        navigate(
                          isPlatform
                            ? `/platform-roles/${activeRole.role}/edit`
                            : `/settings/roles/${activeRole.role}/edit`,
                        )
                      }
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || deleting}
                      onClick={() => setConfirmDeleteOpen(true)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving || !activeRole.customized}
                  onClick={() => setConfirmOpen(true)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <Button type="button" size="sm" disabled={saving || !dirty} onClick={handleSave}>
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {activeRole && matrix ? (
              <RolePermissionEditor
                role={activeRole}
                catalog={matrix.catalog}
                selected={selected}
                onToggle={toggle}
                onToggleGroup={toggleGroup}
                disabled={saving}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No roles available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Reset ${activeRole?.label ?? "role"}?`}
        description="This drops every customization and restores the built-in defaults for this role."
        confirmLabel="Reset to defaults"
        onConfirm={handleReset}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete ${activeRole?.label ?? "role"}?`}
        description="This permanently removes the role and its permission set. Roles still held by members cannot be deleted."
        confirmLabel="Delete role"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
