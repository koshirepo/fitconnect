import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Breadcrumb, { type BreadcrumbItem } from "@/components/ui/breadcrumb";
import * as React from "react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  members: "Members",
  workouts: "Workout Plans",
  payments: "Payments",
  subscriptions: "Subscriptions",
  badges: "Badges",
  audit: "Audit Logs",
  profile: "Profile",
  shop: "Shop",
  products: "Products",
  cart: "Cart",
  checkout: "Checkout",
  orders: "Orders",
  history: "History",
  "platform-commerce": "Commerce",
  tenants: "Tenants",
  "platform-audit": "Platform Audit Logs",
  add: "Add",
  create: "Create",
  record: "Record",
  edit: "Edit",
};

const OPAQUE_ID_REGEX = /^[a-z0-9]{18,}$/i;

function toTitle(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function labelForSegment(segment: string, previous?: string) {
  if (segment === "add" && previous === "members") return "Add Member";
  if (segment === "add" && previous === "tenants") return "Add Tenant";
  if (segment === "create" && previous === "subscriptions") return "Create Subscription";
  if (segment === "create" && previous === "badges") return "Create Badge";
  if (segment === "record" && previous === "payments") return "Record Payment";
  if (segment === "edit" && previous === "members") return "Edit Member";

  if (OPAQUE_ID_REGEX.test(segment)) {
    if (previous === "members") return "Member";
    if (previous === "tenants") return "Tenant";
    if (previous === "payments") return "Payment";
    if (previous === "orders") return "Order";
    if (previous === "products") return "Product";
    if (previous === "record") return "Member";
    return "Details";
  }

  return SEGMENT_LABELS[segment] ?? toTitle(segment);
}

export function Header() {
  const { toggleSidebar } = useUIStore();
  const { currentMembership, isPlatformStaff } = useAuthStore();
  const location = useLocation();
  const membership = currentMembership();
  const breadcrumbItems = React.useMemo<BreadcrumbItem[]>(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return [];

    return segments.map((segment, index) => {
      const previous = segments[index - 1];
      const href = `/${segments.slice(0, index + 1).join("/")}`;
      const active = index === segments.length - 1;

      return {
        label: labelForSegment(segment, previous),
        ...(active ? { active: true } : { href }),
      };
    });
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/60 bg-background/80 px-4 backdrop-blur-xl">
      <Button variant="ghost" size="icon" onClick={toggleSidebar}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1 overflow-hidden">
        {breadcrumbItems.length > 0 && (
          <Breadcrumb
            items={breadcrumbItems}
            className="overflow-x-auto whitespace-nowrap pb-1 pr-2 [&::-webkit-scrollbar]:hidden"
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        {membership && <Badge variant="secondary">{membership.role}</Badge>}
        {isPlatformStaff() && (
          <Badge variant="accent" className="text-accent">
            Platform Staff
          </Badge>
        )}
      </div>
    </header>
  );
}
