/**
 * Documentation: One frame around every public page a gym has.
 *
 * - The profile, the shop, a product, signing in, and joining were five screens that each drew their own heading and ended in nothing. To a visitor they are one website, and a site whose header moves between pages reads as several sites badly linked together.
 * - Header and footer come from the gym's own branding — its mark, its name, its number, its address — so the frame is the thing that says whose site this is and every page inside it can get on with its own job.
 * - The accent is the gym's too, painted app-wide by `useBrandTheme`. Nothing here picks a colour; it uses the tokens, which is what makes a gym's colour reach a page nobody thought about.
 * - Primary exports: TenantPublicLayout.
 */
import * as React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogIn, MapPin, MessageCircle, Phone, ShoppingBag } from "lucide-react";

import { publicApi } from "@/api/public";
import { useAuthStore } from "@/stores/auth";
import {
  readCachedTenantBranding,
  writeCachedTenantBranding,
  type TenantBranding,
} from "@/lib/tenant-branding";
import { resolveAssetUrl } from "@/lib/assets";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/store", label: "Store", end: false },
] as const;

export function TenantPublicLayout() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  // Read from the cache first so the mark and the name are on the first frame.
  // A header that appears a beat after the page is a header that flickers.
  const [brand, setBrand] = React.useState<TenantBranding | null>(() =>
    readCachedTenantBranding(),
  );

  React.useEffect(() => {
    if (brand) return;

    const host = typeof window === "undefined" ? "" : window.location.host;
    let active = true;

    publicApi
      .getTenantBranding(host)
      .then((res) => {
        const next = res.data.data.tenant as TenantBranding | undefined;
        if (!next || !active) return;
        setBrand(next);
        writeCachedTenantBranding(next, host);
      })
      .catch(() => {
        // The pages work unbranded. A missing logo is not an error state.
      });

    return () => {
      active = false;
    };
  }, [brand]);

  const logo = brand?.logoUrl ? (resolveAssetUrl(brand.logoUrl) ?? brand.logoUrl) : null;
  const name = brand?.name ?? "";
  const whatsappUrl = buildWhatsAppUrl(brand?.phone);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
          {/* The mark and the name, together, are the way home — the convention
              every site a visitor has ever used already taught them. */}
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border">
              {logo ? (
                <img src={logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <span className="truncate font-semibold">{name || "FitConnect"}</span>
          </Link>

          <nav className="ml-2 flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {isAuthenticated ? (
              <Button size="sm" onClick={() => navigate("/dashboard")}>
                Dashboard
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
                  <LogIn className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign in</span>
                </Button>
                <Button size="sm" onClick={() => navigate("/signup")}>
                  Join
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="font-semibold">{name || "FitConnect"}</p>
              {brand?.description && (
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {brand.description}
                </p>
              )}
            </div>

            <div className="space-y-1.5 text-sm text-muted-foreground">
              {brand?.phone && (
                <a
                  href={`tel:${brand.phone}`}
                  className="flex items-center gap-2 hover:text-foreground"
                >
                  <Phone className="h-4 w-4" />
                  {brand.phone}
                </a>
              )}
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-foreground"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat on WhatsApp
                </a>
              )}
              {brand?.address && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="max-w-xs">{brand.address}</span>
                </p>
              )}
            </div>
          </div>

          <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
            Powered by FitConnect
          </p>
        </div>
      </footer>
    </div>
  );
}
