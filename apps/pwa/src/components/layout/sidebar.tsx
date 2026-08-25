import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import * as React from "react";
import { tenantsApi } from "@/api/tenants";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { resolveAssetUrl } from "@/lib/assets";
import { buildTenantPublicUrl, getTenantDashboardPath, isTenantSubdomain } from "@/lib/subdomain";
import { cn } from "@/lib/utils";
import { Permission } from "@fitconnect/shared/types/permissions";
import { usePermissions } from "@/features/auth/permission-gate";
import {
  LayoutDashboard,
  Building2,
  Users,
  Dumbbell,
  CreditCard,
  Package,
  ShoppingBag,
  ScrollText,
  Award,
  ListTodo,
  Settings,
  LogOut,
  X,
  CalendarCheck,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import AvatarCard from "../ui/avatarCard";
import type { Tenant } from "@/types/api";

/**
 * Navigation entries gate on capabilities, not role names: an item shows when
 * the user holds at least one of its `anyOf` permissions, and an item with no
 * `anyOf` is always visible. This keeps the sidebar in step with the permission
 * catalog and with any overrides configured on the roles screens.
 */
type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  anyOf?: Permission[];
  excludePrefixes?: string[];
  /**
   * Match this path exactly rather than as a prefix. Needed for Dashboard,
   * because on a gym subdomain every other page is nested under `/dashboard`
   * and would otherwise light it up too.
   */
  exact?: boolean;
};

const platformNav: NavItem[] = [
  {
    to: "/tenants",
    label: "Tenants",
    icon: Building2,
    anyOf: [Permission.PLATFORM_TENANTS_READ],
  },
  {
    to: "/platform-commerce",
    label: "Commerce",
    icon: ShoppingBag,
    anyOf: [Permission.PLATFORM_PRODUCTS_READ],
    excludePrefixes: ["/platform-commerce/orders"],
  },
  {
    to: "/platform-commerce/orders",
    label: "Orders",
    icon: Package,
    anyOf: [Permission.PLATFORM_ORDERS_READ],
  },
  {
    to: "/platform-roles",
    label: "Roles & Permissions",
    icon: ShieldCheck,
    anyOf: [Permission.PLATFORM_ROLES_READ],
  },
  {
    to: "/platform-audit",
    label: "Audit Logs",
    icon: ScrollText,
    anyOf: [Permission.AUDIT_PLATFORM_READ],
  },
];

const tenantNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/members", label: "Members", icon: Users, anyOf: [Permission.MEMBERS_READ] },
  {
    to: "/referrals",
    label: "Referrals",
    icon: UserPlus,
    anyOf: [Permission.MEMBERS_REFERRALS_READ],
  },
  { to: "/todos", label: "Todos", icon: ListTodo, anyOf: [Permission.TODOS_READ] },
  {
    to: "/workouts",
    label: "Workout Plans",
    icon: Dumbbell,
    anyOf: [Permission.WORKOUTS_READ],
  },
  {
    to: "/payments",
    label: "Payments",
    icon: CreditCard,
    anyOf: [Permission.PAYMENTS_READ, Permission.PAYMENTS_READ_SELF],
  },
  {
    to: "/subscriptions",
    label: "Subscriptions",
    icon: Package,
    anyOf: [Permission.SUBSCRIPTIONS_READ],
  },
  {
    to: "/attendance",
    label: "Attendance",
    icon: CalendarCheck,
    anyOf: [Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CHECKIN_SELF],
  },
  { to: "/orders/history", label: "My Orders", icon: ShoppingBag },
  { to: "/badges", label: "Badges", icon: Award, anyOf: [Permission.BADGES_READ] },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    anyOf: [Permission.SETTINGS_UPDATE],
    // Roles has its own entry below and is nested under /settings.
    excludePrefixes: ["/settings/roles"],
  },
  {
    to: "/settings/roles",
    label: "Roles & Permissions",
    icon: ShieldCheck,
    anyOf: [Permission.ROLES_READ],
  },
  { to: "/audit", label: "Audit Logs", icon: ScrollText, anyOf: [Permission.AUDIT_TENANT_READ] },
];

export function Sidebar() {
  const {
    user,
    logout,
    currentTenantId,
    isPlatformStaff,
    currentMembership,
  } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, isMobile } = useUIStore();
  const { canAny } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentTenant, setCurrentTenant] = React.useState<Tenant | null>(null);

  const membership = currentMembership();
  const tenantPublicUrl = membership?.tenantSlug
    ? buildTenantPublicUrl(membership.tenantSlug)
    : currentTenant?.slug
      ? buildTenantPublicUrl(currentTenant.slug)
      : "/";
  const getTenantRoute = (path: string) => (isTenantSubdomain() ? getTenantDashboardPath(path) : path);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };


  React.useEffect(() => {
    if (!currentTenantId) {
      setCurrentTenant(null);
      return;
    }

    let cancelled = false;

    void tenantsApi
      .get(currentTenantId)
      .then((res) => {
        if (!cancelled) {
          setCurrentTenant(res.data.data.tenant);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentTenant(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentTenantId]);

  React.useEffect(() => {
    const handleTenantUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ tenant?: Tenant }>;
      const updatedTenant = customEvent.detail?.tenant;
      if (updatedTenant && updatedTenant.id === currentTenantId) {
        setCurrentTenant(updatedTenant);
      }
    };

    window.addEventListener("tenant-updated", handleTenantUpdated as EventListener);
    return () => {
      window.removeEventListener("tenant-updated", handleTenantUpdated as EventListener);
    };
  }, [currentTenantId]);

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200",
          isMobile && !sidebarOpen && "-translate-x-full",
          !isMobile && !sidebarOpen && "-translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2 min-w-0">
            <Link to="/">
              <img
                key={currentTenant?.logoUrl ?? "default-logo"}
                src={resolveAssetUrl(currentTenant?.logoUrl) ?? "/icons/whiteLogo.png"}
                alt={currentTenant?.name ?? "FitConnect"}
                className="h-7 w-7 rounded-md shrink-0 object-cover"
              />
            </Link>
            <a href={tenantPublicUrl} target="_blank" rel="noreferrer noopener">
              <span className="text-lg font-bold tracking-tight truncate text-gradient-brand">
                {currentTenant?.name ?? (membership ? membership.tenantName : "FitConnect")}
              </span>
            </a>
          </div>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* Platform nav for super-admin / support */}
          {isPlatformStaff() && (
            <>
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Platform
              </p>
              {platformNav
                .filter((item) => !item.anyOf?.length || canAny(...item.anyOf))
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    onClick={() => isMobile && setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent",
                        isActive &&
                          !item.excludePrefixes?.some((prefix) =>
                            location.pathname.startsWith(prefix),
                          ) &&
                          "bg-primary/10 text-primary border-l-2 border-primary",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              <div className="my-2 border-b" />
            </>
          )}

          {/* Tenant nav */}
          {currentTenantId && (
            <>
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gym
              </p>
              {tenantNav
                .filter((item) => !item.anyOf?.length || canAny(...item.anyOf))
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={getTenantRoute(item.to)}
                    end={item.exact}
                    onClick={() => isMobile && setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent",
                        isActive &&
                          !item.excludePrefixes?.some((prefix) =>
                            location.pathname.startsWith(getTenantRoute(prefix)),
                          ) &&
                          "bg-primary/10 text-primary border-l-2 border-primary",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
            </>
          )}
        </nav>

        {/* User section */}
        <div className="border-t border-sidebar-border p-3">
          <NavLink
            to={getTenantRoute("/profile")}
            onClick={() => isMobile && setSidebarOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 hover:bg-sidebar-accent"
          >
            {/* <Avatar src={user?.avatarUrl} fallback={getInitials(user?.name ?? "U")} size="sm" />
            <div className="flex-1 truncate">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div> */}
            <AvatarCard
              name={user?.name ?? "User"}
              avatarUrl={user?.avatarUrl}
              variant="sm"
            >
              <div className="flex-1 truncate">
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </AvatarCard>
          </NavLink>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
