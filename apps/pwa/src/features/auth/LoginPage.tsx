import * as React from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { getApiError } from "@/api/client";
import { publicApi } from "@/api/public";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell } from "lucide-react";
import { isTenantSubdomain } from "@/lib/subdomain";
import { readCachedTenantBranding, writeCachedTenantBranding, type TenantBranding } from "@/lib/tenant-branding";
import { resolveAssetUrl } from "@/lib/assets";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuthStore();
  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const tenantContext = isTenantSubdomain();
  const defaultRedirect = tenantContext ? "/" : "/dashboard";
  const redirectTo = from?.pathname ? `${from.pathname}${from.search ?? ""}` : defaultRedirect;

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [tenantBrand, setTenantBrand] = React.useState<TenantBranding | null>(null);

  React.useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  React.useEffect(() => {
    if (!tenantContext) {
      setTenantBrand(null);
      return;
    }

    const host = typeof window !== "undefined" ? window.location.host : "";
    const cachedBrand = readCachedTenantBranding(host);
    if (cachedBrand) {
      setTenantBrand(cachedBrand);
      return;
    }

    publicApi
      .getTenantBranding(host)
      .then((res) => {
        const nextBrand = res.data.data.tenant as TenantBranding | undefined;
        if (!nextBrand) return;
        setTenantBrand(nextBrand);
        writeCachedTenantBranding(nextBrand, host);
      })
      .catch(() => {
        setTenantBrand(null);
      });
  }, [tenantContext]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const brandLogo = tenantBrand?.logoUrl ? resolveAssetUrl(tenantBrand.logoUrl) ?? tenantBrand.logoUrl : null;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-primary/5">
            {brandLogo ? (
              <img src={brandLogo} alt={tenantBrand?.name ? `${tenantBrand.name} logo` : "Brand logo"} className="h-full w-full object-cover" />
            ) : (
              <Dumbbell className="h-8 w-8 text-primary" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {tenantBrand?.name ?? "Welcome back"}
          </CardTitle>
          <CardDescription className="space-y-2">
            <span>
              {tenantBrand?.description || (tenantContext ? "Sign in to manage your gym and members." : "Sign in to your FitConnect account.")}
            </span>
            {tenantBrand && (
              <div className="space-y-1 text-xs text-muted-foreground">
                {tenantBrand.address && <div>{tenantBrand.address}</div>}
                {tenantBrand.email && <div>{tenantBrand.email}</div>}
                {tenantBrand.phone && <div>{tenantBrand.phone}</div>}
              </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : "Sign In"}
            </Button>

            <div className="text-right">
              <Link
                to="/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          </form>

          {/* Joining is gym-specific, so this only makes sense on a gym's own site. */}
          {tenantContext && (
            <div className="mt-4 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link
                to="/signup"
                className="font-medium text-foreground hover:underline"
              >
                Join {tenantBrand?.name ?? "this gym"}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
