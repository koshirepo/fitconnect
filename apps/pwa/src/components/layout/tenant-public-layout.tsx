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
import {
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  ShoppingBag,
  User,
} from "lucide-react";

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
import { WhatsAppFab } from "@/components/ui/whatsapp-fab";
import { SiteFooter } from "./site-footer";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Two letters for the avatar, when there is no picture. */
function initials(name?: string | null) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Role keys are shouted; a header is not the place for that. */
function roleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase().replaceAll("_", " ");
}

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/store", label: "Store", end: false },
] as const;

export function TenantPublicLayout() {
  const navigate = useNavigate();
  const { isAuthenticated, user, currentMembership, logout } = useAuthStore();
  const membership = currentMembership();

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
        {/* Four things compete for a phone's width here: the mark, the gym's
            name, two nav links, and the account. At 375px the name was the one
            that lost, truncating to "Seed G…" — the single most important word
            on a gym's own site. So the mark shrinks, the gaps tighten, and the
            name takes whatever is left rather than being squeezed by a fixed
            row beside it. */}
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 md:px-6">
          {/* The mark and the name, together, are the way home — the convention
              every site a visitor has ever used already taught them. */}
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border sm:h-9 sm:w-9">
              {logo ? (
                <img src={logo} alt="" className="h-full w-full object-cover" />
              ) : (
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <span className="truncate font-semibold">{name || "FitConnect"}</span>
          </Link>

          <nav className="flex shrink-0 items-center gap-0.5 sm:ml-2 sm:gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2 py-1.5 text-sm transition-colors sm:px-2.5",
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

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {isAuthenticated ? (
              /* Who you are signed in as, not just a way out of the page.
                 A gym's own site is where somebody checks which account
                 they are on before they buy anything. */
              <Menu>
                <MenuTrigger className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted">
                  <span className="grid h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid place-items-center">{initials(user?.name)}</span>
                    )}
                  </span>
                  <span className="hidden min-w-0 flex-col sm:flex">
                    <span className="truncate text-sm leading-tight font-medium">
                      {user?.name ?? "Account"}
                    </span>
                    {membership?.role && (
                      <span className="truncate text-[11px] leading-tight text-muted-foreground">
                        {roleLabel(membership.role)}
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </MenuTrigger>

                <MenuContent align="end" side="bottom">
                  <MenuItem onClick={() => navigate("/dashboard")}>
                    <LayoutDashboard />
                    Dashboard
                  </MenuItem>
                  <MenuItem onClick={() => navigate("/dashboard/profile")}>
                    <User />
                    Profile
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onClick={() => {
                      logout();
                      navigate("/");
                    }}
                  >
                    <LogOut />
                    Sign out
                  </MenuItem>
                </MenuContent>
              </Menu>
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

      {/* Follows the page rather than sitting in the footer: asking a
          question is the thing a visitor most often wants, and it should
          not require scrolling to the bottom of a product page to find. */}
      <WhatsAppFab url={whatsappUrl} />

      <SiteFooter variant="tenant" gym={brand} signedIn={isAuthenticated} />
    </div>
  );
}
