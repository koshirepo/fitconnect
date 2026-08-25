import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import { useMyProfile, useUpdateMyProfile } from "@/api/queries/members";
import { uploadsApi } from "@/api/uploads";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AvatarCard from "@/components/ui/avatarCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PhotoCapture } from "@/components/ui/photo-capture";
import { PageLoader } from "@/components/ui/spinner";
import { Camera } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";

export default function ProfilePage() {
  const { currentTenantId, user } = useAuthStore();

  const profileQuery = useMyProfile();
  const profile = profileQuery.data ?? null;
  const loading = profileQuery.isLoading;

  // Both saves invalidate the members key, which this profile query lives under,
  // so the refreshed profile arrives without a manual re-read.
  const updateProfile = useUpdateMyProfile();

  // Edit form
  const [editing, setEditing] = React.useState(false);
  const [fName, setFName] = React.useState("");
  const [fCurrentPwd, setFCurrentPwd] = React.useState("");
  const [fNewPwd, setFNewPwd] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [formSuccess, setFormSuccess] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Photo upload
  const [photoDialogOpen, setPhotoDialogOpen] = React.useState(false);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [photoError, setPhotoError] = React.useState("");
  const currentPhoto = profile?.avatarUrl ?? null;
  const photoChanged = photoFile !== null || photoPreview !== currentPhoto;

  // Seed the name field once the profile arrives, without clobbering an edit in
  // progress if the query refetches in the background.
  React.useEffect(() => {
    if (profile && !editing) setFName(profile.name);
  }, [profile, editing]);

  const handlePhotoSave = async () => {
    if (!currentTenantId || !profile || !photoChanged) return;
    setPhotoError("");
    setUploadingPhoto(true);
    try {
      let avatarUrl = photoPreview;

      if (photoFile) {
        const uploadRes = await uploadsApi.uploadAvatar(photoFile);
        avatarUrl = uploadRes.data.data.url;
      }

      await updateProfile.mutateAsync({ avatarUrl: avatarUrl ?? null });
      setPhotoDialogOpen(false);
      setPhotoFile(null);
      setPhotoPreview(null);
    } catch (err) {
      setPhotoError(getApiError(err));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId) return;
    setFormError("");
    setFormSuccess("");
    setSubmitting(true);

    try {
      const payload: Record<string, string | undefined> = {};
      if (fName !== profile?.name) payload.name = fName;
      if (fNewPwd) {
        payload.currentPassword = fCurrentPwd;
        payload.newPassword = fNewPwd;
      }

      await updateProfile.mutateAsync(payload);
      setFormSuccess("Profile updated successfully!");
      setEditing(false);
      setFCurrentPwd("");
      setFNewPwd("");
    } catch (err) {
      setFormError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader />;

  if (!currentTenantId || !profile) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Select a gym from the sidebar to view your profile.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Summary */}
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6">
            {/* Avatar with change photo overlay */}
            <button
              type="button"
              className="group relative cursor-pointer rounded-full"
              onClick={() => {
                setPhotoDialogOpen(true);
                setPhotoFile(null);
                setPhotoPreview(profile.avatarUrl ?? null);
                setPhotoError("");
              }}
              title="Change profile photo"
            >
              <AvatarCard
                name={profile.name}
                avatarUrl={profile.avatarUrl}
                variant="xl"
                vertical
                role={profile.role}
                dueDate={profile.dueDate}
                isActive={profile.status === "ACTIVE"}
              >
                <p className="text-sm text-muted-foreground">{profile.email}</p>
                {profile.phone && <p className="text-sm text-muted-foreground">{profile.phone}</p>}
              </AvatarCard>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 flex h-20 w-20 items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-6 w-6 text-white" />
              </div>
            </button>

            <div className="mt-2 flex gap-2">
              <Badge variant="secondary">{profile.role}</Badge>
              <Badge variant={profile.status === "ACTIVE" ? "success" : "destructive"}>
                {profile.status}
              </Badge>
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              Member since {formatDate(profile.joinedAt)}
            </div>
            {user?.platformRole && user.platformRole !== "USER" && (
              <Badge variant="outline" className="mt-2 text-blue-400 border-blue-400/30">
                {user.platformRole}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Photo Upload Dialog */}
        <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Profile Photo</DialogTitle>
              <DialogDescription>
                Take a new photo, upload one, or remove the current photo.
              </DialogDescription>
            </DialogHeader>
            <PhotoCapture
              value={photoPreview}
              onChange={(file, preview) => {
                setPhotoFile(file);
                setPhotoPreview(preview);
                setPhotoError("");
              }}
              requireFace
            />
            {photoError && <p className="text-sm text-destructive">{photoError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPhotoDialogOpen(false)}
                disabled={uploadingPhoto}
              >
                Cancel
              </Button>
              <Button onClick={handlePhotoSave} disabled={!photoChanged || uploadingPhoto}>
                {uploadingPhoto ? "Uploading…" : "Save Photo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Edit Profile</CardTitle>
                <CardDescription>Update your name or change your password</CardDescription>
              </div>
              {!editing && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    required
                    minLength={2}
                  />
                </div>
                <div className="border-t pt-4 space-y-2">
                  <p className="text-sm font-medium">Change Password</p>
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <Input
                      type="password"
                      value={fCurrentPwd}
                      onChange={(e) => setFCurrentPwd(e.target.value)}
                      placeholder="Leave blank to keep current"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={fNewPwd}
                      onChange={(e) => setFNewPwd(e.target.value)}
                      placeholder="Min 8 characters"
                      minLength={8}
                    />
                  </div>
                </div>

                {formError && <p className="text-sm text-destructive-foreground">{formError}</p>}

                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setFName(profile.name);
                      setFormError("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name</span>
                  <span>{profile.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span>{profile.email}</span>
                </div>
                {profile.phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{profile.phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span>{profile.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Joined</span>
                  <span>{formatDate(profile.joinedAt)}</span>
                </div>
                {formSuccess && <p className="text-sm text-emerald-500">{formSuccess}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Payments */}
      {profile.payments && profile.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {profile.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{p.subscription?.title ?? "Payment"}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.paidAt ? formatDate(p.paidAt) : "Pending"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatCurrency(p.amount)}</p>
                    <Badge
                      variant={
                        p.status === "COMPLETED"
                          ? "success"
                          : p.status === "PENDING"
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {p.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
