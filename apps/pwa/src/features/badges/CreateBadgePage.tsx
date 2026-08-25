import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useCreateBadge } from "@/api/queries/catalog";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Award, AlertCircle, CheckCircle2 } from "lucide-react";

// ─── Preset color options ─────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { value: "#6366f1", label: "Indigo" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#10b981", label: "Emerald" },
  { value: "#ef4444", label: "Red" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
  { value: "#14b8a6", label: "Teal" },
];

export default function CreateBadgePage() {
  const navigate = useAppNavigate();
  const { currentTenantId } = useAuthStore();
  const { can } = usePermissions();
  const createBadge = useCreateBadge();

  // ─── Form state ─────────────────────────────────────────────────────────────
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState("#6366f1");
  const [customColor, setCustomColor] = React.useState(false);
  const [icon, setIcon] = React.useState("");

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  // Badge authoring is gated on the capability, not the ADMIN role name.
  if (!can(Permission.BADGES_CREATE)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Only administrators can create badges.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/badges")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Badges
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;

    setError("");
    setSubmitting(true);

    try {
      await createBadge.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
        icon: icon.trim() || undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success state ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
            <CardTitle>Badge Created!</CardTitle>
            <CardDescription>
              The badge &quot;{name}&quot; has been created successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <Button onClick={() => navigate("/badges")} className="w-full max-w-xs">
              View All Badges
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccess(false);
                setName("");
                setDescription("");
                setColor("#6366f1");
                setCustomColor(false);
                setIcon("");
              }}
              className="w-full max-w-xs"
            >
              <Award className="h-4 w-4" />
              Create Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Form ───────────────────────────────────────────────────────────────────
  const selectedPreset = COLOR_PRESETS.find((p) => p.value === color);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/badges")}
          aria-label="Back to badges"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Badge</h1>
          <p className="text-muted-foreground">
            Design a new badge to reward and recognize your members.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Badge Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Badge Details</CardTitle>
            <CardDescription>Give your badge a name and optional description.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="badge-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="badge-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 100 Sessions, Top Performer, Early Bird"
                required
                minLength={2}
                maxLength={100}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="badge-desc">Description</Label>
              <Textarea
                id="badge-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this badge represents and how members can earn it."
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="badge-icon">Icon Identifier</Label>
              <Input
                id="badge-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="e.g. star, trophy, flame (optional)"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">
                An optional short identifier for the badge icon.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Color Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Badge Color</CardTitle>
            <CardDescription>Choose a color that represents this badge.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preview */}
            <div className="flex items-center gap-4 rounded-lg border p-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-white text-xl font-bold shadow-md"
                style={{ backgroundColor: color }}
              >
                {name ? name.charAt(0).toUpperCase() : "B"}
              </div>
              <div>
                <p className="font-semibold">{name || "Badge Preview"}</p>
                <p className="text-sm text-muted-foreground">
                  {description || "Badge description will appear here"}
                </p>
              </div>
            </div>

            {/* Preset colors */}
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => {
                    setColor(preset.value);
                    setCustomColor(false);
                  }}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                    !customColor && selectedPreset?.value === preset.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div
                    className="h-5 w-5 rounded-full border"
                    style={{ backgroundColor: preset.value }}
                  />
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom color */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setCustomColor(true)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  customColor
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                }`}
              >
                Custom Color
              </button>
              {customColor && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border p-0.5"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#6366f1"
                    className="w-28 font-mono text-sm"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/badges")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? "Creating..." : "Create Badge"}
          </Button>
        </div>
      </form>
    </div>
  );
}
