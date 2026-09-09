import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import { useMyProfile, useUpdateMyProfile } from "@/api/queries/members";
import { uploadsApi } from "@/api/uploads";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { AvatarTile } from "@/components/ui/member-card";
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
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { PushToggle } from "@/components/ui/push-toggle";
import { PasskeysCard } from "./PasskeysCard";
import { FreezeCard } from "@/components/ui/freeze-card";
import { useCoinBalance } from "@/api/queries/coupons";
import { useToast } from "@/components/ui/toast";
import { Bell, Cake, Calendar, Camera, Coins, CreditCard, Mail, Pencil, Phone } from "lucide-react";
import { ageFromDateOfBirth } from "@/lib/occupation";
import { OccupationGlyph } from "@/components/ui/occupation-glyph";
import { formatDate, formatCurrency } from "@/lib/utils";

export default function ProfilePage() {
  const toast = useToast();
  const { currentTenantId, user } = useAuthStore();

  const profileQuery = useMyProfile();
  const profile = profileQuery.data ?? null;

  const coinsQuery = useCoinBalance(profile?.id);
  const coinBalance = coinsQuery.data?.balance ?? 0;
  const navigate = useAppNavigate();
  const loading = profileQuery.isPending;

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
      toast.success("Photo updated.");
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

  if (loading) return <DetailPageSkeleton />;

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

  const platformRole =
    user?.platformRole && user.platformRole !== "USER" ? user.platformRole : null;

  const profileAge = ageFromDateOfBirth(profile.dateOfBirth);

  const openPhotoDialog = () => {
    setPhotoDialogOpen(true);
    setPhotoFile(null);
    setPhotoPreview(profile.avatarUrl ?? null);
    setPhotoError("");
  };

  return (
    <div className="space-y-6">
      {/* ── Identity ──────────────────────────────────────────────────────
          This page used to open with the avatar inside a card, sitting in a
          three-column grid beside five more cards of exactly the same weight —
          so nothing on the screen claimed to matter more than the notification
          toggle, and the person's own name carried no more emphasis than a
          heading inside a box. The header band is the one a member's detail
          page already uses. It is the same object, seen from the other side. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {/* Only the photo opens the photo dialog. The whole identity card
              used to be one button, so clicking your own name or your email
              asked you to change your picture. */}
          <button
            type="button"
            onClick={openPhotoDialog}
            title="Change profile photo"
            aria-label="Change profile photo"
            className="group relative shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <AvatarTile
              person={{
                name: profile.name,
                avatarUrl: profile.avatarUrl,
                gender: profile.gender,
                role: profile.role,
                status: profile.status,
              }}
              size="md"
              // A standalone square, not a row tile: `stacked` swaps the list
              // row's single right-edge accent for a full rounded border, which
              // is what a header avatar with no row around it needs.
              stacked
              zoomable={false}
              className="h-20 w-20 sm:h-24 sm:w-24"
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </span>
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {profile.name}
            </h1>

            {/* One meta row, wrapping. These facts used to be printed twice —
                once here and once as a key/value table further down titled
                "Edit Profile" — so a changed phone number had two places on
                one screen to disagree with itself. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <span className="flex w-full min-w-0 items-center gap-1 sm:w-auto">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{profile.email}</span>
              </span>
              {profile.phone && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {profile.phone}
                </span>
              )}
              {profile.dateOfBirth && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Cake className="h-3.5 w-3.5 shrink-0" />
                  {formatDate(profile.dateOfBirth)}
                  {profileAge !== null && ` · ${profileAge}`}
                </span>
              )}
              {profile.occupation && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <OccupationGlyph icon={profile.occupation.icon} className="h-3.5 w-3.5 shrink-0" />
                  {profile.occupation.name}
                </span>
              )}
              <span className="flex items-center gap-1 whitespace-nowrap">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                Member since {formatDate(profile.joinedAt)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{profile.role}</Badge>
              <Badge variant={profile.status === "ACTIVE" ? "success" : "destructive"}>
                {profile.status}
              </Badge>
              {platformRole && (
                <Badge variant="outline" className="border-blue-400/30 text-blue-400">
                  {platformRole}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* This was a whole grid cell holding one button under two lines of
            explanation, about two thirds of it empty. It is a link, and it
            reads as one. */}
        {profile.idCardUrl && (
          <a href={profile.idCardUrl} className="shrink-0">
            <Button variant="outline" size="sm">
              <CreditCard className="mr-2 h-4 w-4" />
              Membership card
            </Button>
          </a>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── What you can change ─────────────────────────────────────────
            Titled for what it is. The old "Edit Profile" card showed a
            read-only table of five rows until you pressed Edit, and three of
            those five were already in the header directly above it. */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Account</CardTitle>
                  <CardDescription>Your name and the password you sign in with</CardDescription>
                </div>
                {!editing && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editing ? (
                <form onSubmit={handleUpdate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Name</Label>
                    <Input
                      id="profile-name"
                      value={fName}
                      onChange={(e) => setFName(e.target.value)}
                      required
                      minLength={2}
                    />
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <div>
                      <p className="text-sm font-medium">Change password</p>
                      <p className="text-xs text-muted-foreground">
                        Leave both boxes empty to keep the password you have.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="profile-current-pwd">Current password</Label>
                        <PasswordInput
                          id="profile-current-pwd"
                          value={fCurrentPwd}
                          onChange={(e) => setFCurrentPwd(e.target.value)}
                          placeholder="Current password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="profile-new-pwd">New password</Label>
                        <PasswordInput
                          id="profile-new-pwd"
                          value={fNewPwd}
                          onChange={(e) => setFNewPwd(e.target.value)}
                          placeholder="Min 8 characters"
                          minLength={8}
                        />
                      </div>
                    </div>
                  </div>

                  {formError && <p className="text-sm text-destructive">{formError}</p>}

                  <div className="flex gap-2">
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Saving…" : "Save changes"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditing(false);
                        setFName(profile.name);
                        setFCurrentPwd("");
                        setFNewPwd("");
                        setFormError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <dl className="divide-y text-sm">
                  <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
                    <dt className="text-muted-foreground">Name</dt>
                    <dd className="truncate font-medium">{profile.name}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="truncate">{profile.email}</dd>
                  </div>
                  {profile.phone && (
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd>{profile.phone}</dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 py-2.5">
                    <dt className="text-muted-foreground">Password</dt>
                    <dd className="tracking-widest text-muted-foreground">••••••••</dd>
                  </div>
                  {formSuccess && <p className="pt-3 text-sm text-emerald-500">{formSuccess}</p>}
                </dl>
              )}
            </CardContent>
          </Card>

          {/* Renders nothing where the browser cannot do it, so it sits in the
              flow rather than behind a condition here. */}
          <PasskeysCard />

          {profile.payments && profile.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent payments</CardTitle>
                <CardDescription>What you have paid this gym</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {profile.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {p.subscription?.title ?? "Payment"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.paidAt ? formatDate(p.paidAt) : "Pending"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(p.amount)}
                        </span>
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

        {/* ── The gym's side of the account ───────────────────────────────
            Everything in this column is something the gym gives you, or
            something this one device remembers — not something you type. */}
        <div className="space-y-6">
          {/* Shown at zero as well. Hiding the card until somebody already had
              coins meant the only people told the scheme exists were the ones
              who had already worked it out. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-500" />
                Your coins
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums">{coinBalance}</span>
                {coinBalance > 0 && (
                  <span className="text-sm text-muted-foreground">
                    = {formatCurrency(coinBalance)} off
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {coinBalance > 0
                  ? "Spend them on your next renewal, or on anything in the store."
                  : "One coin is one rupee off a renewal. Bring a friend in, use one of the gym's offers, or buy something in the store that earns them."}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => navigate("/subscriptions")}
              >
                {coinBalance > 0 ? "Spend them on a plan" : "See the plans"}
              </Button>
            </CardContent>
          </Card>

          {profile.id && <FreezeCard membershipId={profile.id} />}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </CardTitle>
              <CardDescription>Alerts on this device</CardDescription>
            </CardHeader>
            <CardContent>
              <PushToggle description="Admins are notified when a member joins and when a payment comes in." />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Photo upload dialog */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change profile photo</DialogTitle>
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
              {uploadingPhoto ? "Uploading…" : "Save photo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
