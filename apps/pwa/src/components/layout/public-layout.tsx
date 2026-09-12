import * as React from "react";
import { Outlet } from "react-router-dom";
import { PublicHeader } from "./public-header";
import { WhatsAppFab } from "@/components/ui/whatsapp-fab";
import { SiteFooter } from "./site-footer";
import { publicApi } from "@/api/public";
import { useAuthStore } from "@/stores/auth";
import { getTenantSlugFromHostname, isTenantSubdomain } from "@/lib/subdomain";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const navItems = [
  { label: "Home", to: "/" },
  { label: "Exercises", to: "/exercises" },
  { label: "Store", to: "/shop" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
];

const DEFAULT_WHATSAPP_URL = "https://wa.me/919479422951";

/**
 * The gutter a public page sits in.
 *
 * `PublicLayout` leaves its `main` unpadded on purpose: the marketing pages
 * open with full-bleed hero sections that have to reach the edges of the
 * screen, and each draws its own container inside that. A page written for the
 * dashboard makes the opposite assumption — `AppLayout` has already padded it
 * — so rendered in this frame it lands flush against both edges.
 *
 * Applied as a route element rather than baked into either page, so the same
 * screen can be shown in either frame without knowing which one it is in.
 */
export function PublicPageContainer() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Outlet />
    </div>
  );
}

export function PublicLayout() {
  const resolvedSlug = getTenantSlugFromHostname();
  // The session is shared across every host of this app, so these pages see a
  // gym's member signed in just as readily as platform staff.
  const signedIn = useAuthStore((state) => state.isAuthenticated);
  const [tenantWhatsAppUrl, setTenantWhatsAppUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isActive = true;

    if (!resolvedSlug || !isTenantSubdomain()) {
      setTenantWhatsAppUrl(null);
      return () => {
        isActive = false;
      };
    }

    setTenantWhatsAppUrl(null);

    publicApi
      .getTenantByHost(typeof window !== "undefined" ? window.location.host : resolvedSlug)
      .then((res) => {
        if (!isActive) return;
        const tenant = res.data.data.tenant;
        setTenantWhatsAppUrl(
          buildWhatsAppUrl(
            tenant.phone,
            `Hi ${tenant.name}, I would like to know more about your gym memberships.`,
          ),
        );
      })
      .catch(() => {
        if (!isActive) return;
        setTenantWhatsAppUrl(null);
      });

    return () => {
      isActive = false;
    };
  }, [resolvedSlug]);

  const whatsappUrl = resolvedSlug ? tenantWhatsAppUrl : DEFAULT_WHATSAPP_URL;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader navItems={navItems} />
      <main className="flex-1">
        <Outlet />
      </main>

      {/* On this host the footer speaks as the product, not as a gym. */}
      <SiteFooter variant="app" signedIn={signedIn} />

      <WhatsAppFab url={whatsappUrl} />
    </div>
  );
}
