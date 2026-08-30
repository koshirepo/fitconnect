import * as React from "react";
import { Outlet } from "react-router-dom";
import { PublicHeader } from "./public-header";
import { WhatsAppFab } from "@/components/ui/whatsapp-fab";
import { SiteFooter } from "./site-footer";
import { publicApi } from "@/api/public";
import { getTenantSlugFromHostname, isTenantSubdomain } from "@/lib/subdomain";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

const navItems = [
  { label: "Home", to: "/" },
  { label: "Store", to: "/shop" },
  { label: "About", to: "/about" },
  { label: "Contact", to: "/contact" },
];

const DEFAULT_WHATSAPP_URL = "https://wa.me/919479422951";

export function PublicLayout() {
  const resolvedSlug = getTenantSlugFromHostname();
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
      <SiteFooter variant="app" />

      <WhatsAppFab url={whatsappUrl} />
    </div>
  );
}
