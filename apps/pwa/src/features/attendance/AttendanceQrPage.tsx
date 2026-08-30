import * as React from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { attendanceApi } from "@/api/attendance";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { resolveAssetUrl } from "@/lib/assets";
import { useWakeLock } from "@/lib/use-wake-lock";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { CheckCircle2, LogIn } from "lucide-react";

export default function AttendanceQrPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  // This page is propped up and read, not held and tapped. A screen that locks
  // itself between the first member of the morning and the second is a screen
  // somebody has to walk over and wake.
  useWakeLock();
  const [tenant, setTenant] = React.useState<{
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [successName, setSuccessName] = React.useState("");
  const [error, setError] = React.useState("");

  const markAttendance = React.useCallback(
    async () => {
      if (!tenantId) return;
      setError("");
      setLoading(true);
      try {
        const res = await attendanceApi.qrCheckIn(tenantId);
        setTenant(res.data.data.tenant);
        setSuccessName(res.data.data.attendance.memberName ?? "Member");
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setLoading(false);
      }
    },
    [tenantId],
  );

  React.useEffect(() => {
    if (!tenantId) return;

    if (isAuthenticated) {
      void markAttendance();
      return;
    }

    setLoading(false);
  }, [tenantId, isAuthenticated, markAttendance]);

  const goToLogin = () => {
    navigate("/login", {
      state: { from: { pathname: location.pathname, search: location.search } },
    });
  };

  if (!tenantId) {
    return <div className="p-6 text-sm text-destructive">Invalid attendance QR.</div>;
  }

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <img
            src={resolveAssetUrl(tenant?.logoUrl) ?? "/icons/icon-192x192.png"}
            alt={tenant?.name ?? "FitConnect"}
            className="h-11 w-11 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{tenant?.name ?? "FitConnect"}</p>
            <p className="text-sm text-muted-foreground">Attendance check-in</p>
          </div>
        </div>

        {loading && !successName ? <CardSkeleton /> : null}

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {successName ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
              <div>
                <p className="text-lg font-semibold">Attendance marked</p>
                <p className="text-sm text-muted-foreground">{successName} is checked in today.</p>
              </div>
              <Link
                to={isAuthenticated ? "/attendance" : "/"}
                className={buttonVariants({ variant: "outline" })}
              >
                Done
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {!isAuthenticated && !successName ? (
          <Card>
            <CardContent className="space-y-4 py-8 text-center">
              <LogIn className="mx-auto h-12 w-12 text-primary" />
              <div>
                <p className="text-lg font-semibold">Sign in required</p>
                <p className="text-sm text-muted-foreground">
                  Login with your member account to mark attendance from this QR.
                </p>
              </div>
              <button type="button" onClick={goToLogin} className={buttonVariants()}>
                Sign In
              </button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
