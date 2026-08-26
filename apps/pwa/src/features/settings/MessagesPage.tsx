import * as React from "react";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useTenantSettings, useUpdateTenantSettings } from "@/api/queries/catalog";
import { getApiError } from "@/api/client";
import type { WhatsAppTemplate, WhatsAppTemplateKey } from "@/types/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { ArrowLeft, MessageSquare, RotateCcw } from "lucide-react";

function toTemplateBodyMap(
  templates: WhatsAppTemplate[],
): Partial<Record<WhatsAppTemplateKey, string>> {
  return templates.reduce<Partial<Record<WhatsAppTemplateKey, string>>>(
    (acc, template) => {
      acc[template.key] = template.body;
      return acc;
    },
    {},
  );
}

export default function MessagesPage() {
  const navigate = useAppNavigate();

  const [templates, setTemplates] = React.useState<WhatsAppTemplate[]>([]);
  const [templateBodies, setTemplateBodies] = React.useState<
    Partial<Record<WhatsAppTemplateKey, string>>
  >({});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [successMsg, setSuccessMsg] = React.useState("");

  const settingsQuery = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const loading = settingsQuery.isLoading;

  // Seed the editable copies once the saved templates arrive.
  React.useEffect(() => {
    const nextTemplates = settingsQuery.data?.whatsappTemplates;
    if (!nextTemplates) return;
    setTemplates(nextTemplates);
    setTemplateBodies(toTemplateBodyMap(nextTemplates));
  }, [settingsQuery.data]);

  const handleSaveTemplates = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const settings = await updateSettings.mutateAsync({
        whatsappTemplates: templates.reduce<
          Partial<Record<WhatsAppTemplateKey, string>>
        >((acc, template) => {
          acc[template.key] = templateBodies[template.key] ?? template.body;
          return acc;
        }, {}),
      });
      const nextTemplates = settings.whatsappTemplates;
      setTemplates(nextTemplates);
      setTemplateBodies(toTemplateBodyMap(nextTemplates));
      setSuccessMsg("WhatsApp templates saved successfully.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <FormPageSkeleton fields={4} />;
  }

  return (
    <div className="mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground">
            Customize tenant-specific WhatsApp templates used across the app.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/settings")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-600">
          {successMsg}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            WhatsApp Templates
          </CardTitle>
          <CardDescription>
            Use placeholders like
            <span className="mx-1 font-mono text-xs">{`{{memberName}}`}</span>
            inside the message body. Each template is saved per tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveTemplates} className="space-y-4">
            {templates.map((template) => (
              <div key={template.key} className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{template.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {template.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Variables:{" "}
                      {template.variables
                        .map((variable) => `{{${variable}}}`)
                        .join(", ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setTemplateBodies((prev) => ({
                        ...prev,
                        [template.key]: template.defaultBody,
                      }))
                    }
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`template-${template.key}`}>Message Body</Label>
                  <Textarea
                    id={`template-${template.key}`}
                    value={templateBodies[template.key] ?? template.body}
                    onChange={(e) =>
                      setTemplateBodies((prev) => ({
                        ...prev,
                        [template.key]: e.target.value,
                      }))
                    }
                    className="min-h-40 font-mono text-sm"
                  />
                </div>
              </div>
            ))}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save WhatsApp Templates"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
