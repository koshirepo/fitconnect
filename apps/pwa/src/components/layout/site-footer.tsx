/**
 * Documentation: The footer on every public page, in the voice of whoever owns the page.
 *
 * - One component, two identities. On a gym's own address it is that gym's footer — its name, its number, its shop, its way in. On the app's own address it is FitConnect's. A single footer that said the same thing on both would be wrong on one of them.
 * - Every link goes somewhere that exists. The columns are built from the routes each host actually serves, so nothing here can rot into a dead link when a page moves.
 * - Where the mock had a newsletter box, a gym gets the thing it actually wants from a visitor: a way to start a conversation, or to join. Nothing is collected that nobody would read.
 * - Primary exports: SiteFooter.
 */
import { Link } from "react-router-dom";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

type Column = { heading: string; links: { label: string; to: string }[] };

export type SiteFooterProps =
  | {
      variant: "tenant";
      gym: {
        name?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
      } | null;
      /** True while somebody is signed in, so the footer stops inviting them to join. */
      signedIn?: boolean;
    }
  | { variant: "app" };

/** The gym's own pages. Short on purpose: there are not many, and that is fine. */
function tenantColumns(signedIn: boolean): Column[] {
  return [
    {
      heading: "The gym",
      links: [
        { label: "Home", to: "/" },
        { label: "Shop", to: "/store" },
      ],
    },
    {
      heading: "Members",
      links: signedIn
        ? [
            { label: "Dashboard", to: "/dashboard" },
            { label: "My profile", to: "/dashboard/profile" },
            { label: "Plans", to: "/dashboard/subscriptions" },
          ]
        : [
            { label: "Sign in", to: "/login" },
            { label: "Join this gym", to: "/signup" },
            { label: "Forgot password", to: "/forgot-password" },
          ],
    },
  ];
}

const APP_COLUMNS: Column[] = [
  {
    heading: "FitConnect",
    links: [
      { label: "Home", to: "/" },
      { label: "About", to: "/about" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    heading: "Shop",
    links: [
      { label: "Browse", to: "/shop" },
      { label: "Your basket", to: "/shop/cart" },
      { label: "Track an order", to: "/shop/orders/lookup" },
    ],
  },
];

export function SiteFooter(props: SiteFooterProps) {
  const isTenant = props.variant === "tenant";
  const gym = isTenant ? props.gym : null;

  const name = isTenant ? (gym?.name ?? "This gym") : "FitConnect";
  const columns = isTenant ? tenantColumns(Boolean(props.signedIn)) : APP_COLUMNS;
  const whatsappUrl = buildWhatsAppUrl(gym?.phone);

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="grid gap-8 md:grid-cols-4">
          {columns.map((column) => (
            <nav key={column.heading} className="min-w-0">
              <h2 className="text-sm font-semibold">{column.heading}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* Where the newsletter sat. A gym has nothing to send monthly and no
              list to send it to, so this is the thing it does want instead: a
              way to be contacted, and a way in. */}
          <div className="md:col-span-2">
            {isTenant ? (
              <>
                <h2 className="text-sm font-semibold">Come and see us</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Walk in during either shift and have a look around. No appointment,
                  no pressure.
                </p>

                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {gym?.address && (
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{gym.address}</span>
                    </p>
                  )}
                  {gym?.phone && (
                    <a
                      href={`tel:${gym.phone}`}
                      className="flex items-center gap-2 transition-colors hover:text-foreground"
                    >
                      <Phone className="h-4 w-4 shrink-0" />
                      {gym.phone}
                    </a>
                  )}
                  {gym?.email && (
                    <a
                      href={`mailto:${gym.email}`}
                      className="flex items-center gap-2 transition-colors hover:text-foreground"
                    >
                      <Mail className="h-4 w-4 shrink-0" />
                      {gym.email}
                    </a>
                  )}
                </div>

                {whatsappUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    nativeButton={false}
                    render={
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" />
                    }
                  >
                    <MessageCircle className="h-4 w-4" />
                    Message us on WhatsApp
                  </Button>
                )}
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold">Run a gym?</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  FitConnect handles members, payments, attendance and a storefront —
                  on your own address, in your own colours.
                </p>
                <Button
                  size="sm"
                  className="mt-4"
                  nativeButton={false}
                  render={<Link to="/contact" />}
                >
                  Talk to us
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {name}. All rights reserved.
          </p>
          {isTenant && (
            <p className="text-xs text-muted-foreground">
              Powered by <span className="font-medium text-foreground">FitConnect</span>
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
