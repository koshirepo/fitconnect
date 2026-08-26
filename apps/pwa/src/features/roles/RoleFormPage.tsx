/**
 * Documentation: Create or edit one custom role.
 *
 * - A page rather than a dialog, so a role written from a deep link, a refresh,
 *   or the back button behaves like every other record in the app.
 * - A `roleKey` in the route means edit and seeds the form from the matrix;
 *   without one it is a create. The key is derived from the name on create and
 *   stays stable on rename, so memberships keep pointing at the same role.
 * - Permission editing lives on the matrix page; this page only sets the
 *   label and description that identify the role.
 * - Primary exports: RoleFormPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import {
  useCreatePlatformRole,
  useCreateTenantRole,
  usePlatformRoleMatrix,
  useTenantRoleMatrix,
  useUpdatePlatformRoleDetails,
  useUpdateTenantRoleDetails,
} from "@/api/queries/roles";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageLoader } from "@/components/ui/spinner";
import { AlertCircle, ArrowLeft } from "lucide-react";

type Props = {
  scope: "tenant" | "platform";
};

export default function RoleFormPage({ scope }: Props) {
  const navigate = useAppNavigate();
  const { roleKey } = useParams<{ roleKey?: string }>();
  const isEdit = Boolean(roleKey);
  const isPlatform = scope === "platform";
  const { currentTenantId } = useAuthStore();
  const backPath = isPlatform ? "/platform-roles" : "/settings/roles";

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const createTenant = useCreateTenantRole(currentTenantId);
  const createPlatform = useCreatePlatformRole();
  const updateTenant = useUpdateTenantRoleDetails(currentTenantId);
  const updatePlatform = useUpdatePlatformRoleDetails();

  const tenantMatrix = useTenantRoleMatrix(isPlatform ? null : currentTenantId);
  const platformMatrix = usePlatformRoleMatrix(isPlatform);
  const matrix = isPlatform ? platformMatrix : tenantMatrix;
  const role = React.useMemo(
    () => matrix.data?.roles.find((entry) => entry.role === roleKey),
    [matrix.data, roleKey],
  );

  // Seeded once: re-seeding on a refetch would discard edits in progress.
  const [seeded, setSeeded] = React.useState(false);
  React.useEffect(() => {
    if (!isEdit || seeded || !role) return;
    setName(role.label);
    setDescription(role.description ?? "");
    setSeeded(true);
  }, [isEdit, seeded, role]);

  if (isEdit && matrix.isLoading) return <PageLoader />;

  if (isEdit && (!role || role.isSystem)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Role not found</CardTitle>
            <CardDescription>
              {role?.isSystem
                ? "Built-in roles cannot be edited here."
                : "This role does not exist in the current scope."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate(backPath)}>
              <ArrowLeft className="h-4 w-4" />
              Back to Roles
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Role name is required.");
      return;
    }
    setError("");
    setSubmitting(true);

    const descriptionValue = description.trim() ? description.trim() : null;

    try {
      if (isEdit && roleKey) {
        if (isPlatform) {
          await updatePlatform.mutateAsync({
            scope: "PLATFORM",
            role: roleKey,
            name: trimmed,
            description: descriptionValue,
          });
        } else {
          await updateTenant.mutateAsync({
            role: roleKey,
            name: trimmed,
            description: descriptionValue,
          });
        }
      } else if (isPlatform) {
        await createPlatform.mutateAsync({
          name: trimmed,
          description: descriptionValue ?? undefined,
          permissions: [],
        });
      } else {
        await createTenant.mutateAsync({
          name: trimmed,
          description: descriptionValue ?? undefined,
          permissions: [],
        });
      }

      navigate(backPath);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEdit ? "Edit Role" : "New Role"}
        </h1>
        <p className="text-muted-foreground">
          {isEdit
            ? "Rename the role or update its description. Its key stays stable, so members keep their assignments."
            : "Add a custom role for your gym, then set its permissions on the roles page."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Role details</CardTitle>
            <CardDescription>What this role is called and what it is for.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">
                Role name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="role-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Front Desk"
                required
                minLength={2}
                maxLength={60}
                autoFocus
              />
              {!isEdit && (
                <p className="text-xs text-muted-foreground">
                  A unique key is generated from the name, e.g. "Front Desk" → FRONT_DESK.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-description">Description</Label>
              <Textarea
                id="role-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this role for?"
                className="min-h-24"
                maxLength={200}
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(backPath)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? "Saving..." : isEdit ? "Save Changes" : "Create Role"}
          </Button>
        </div>
      </form>
    </div>
  );
}
