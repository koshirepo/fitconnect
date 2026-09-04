import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import * as React from "react";
import { tenantsApi } from "@/api/tenants";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { resolveAssetUrl } from "@/lib/assets";
import {
  buildTenantPublicUrl,
  getTenantDashboardPath,
  isTenantSubdomain,
} from "@/lib/subdomain";
import { cn } from "@/lib/utils";
import { Permission } from "@fitconnect/shared/types/permissions";
import { usePermissions } from "@/features/auth/permission-gate";
import {
  LayoutDashboard,
  Building2,
  Users,
  Dumbbell,
  BellRing,
  CreditCard,
  Package,
  Tag,
  ClipboardList,
  ShoppingBag,
  BadgeIndianRupee,
  RotateCcw,
  Warehouse,
  ScrollText,
  Award,
  ListTodo,
  Settings,
  LogOut,
  X,
  CalendarCheck,
  UserPlus,
  ShieldCheck,
  User,
  Globe,
  ChevronUp,
} from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/dropdown-menu";
import type { Tenant } from "@/types/api";
import { getInitials } from "@fitconnect/shared";

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
  /**
   * Hide the item from anybody holding one of these.
   *
   * For entries that a broader permission supersedes: an admin who can see
   * every payslip reaches their own through the salary list, so showing them a
   * second "My salary" link would be two doors to the same room.
   */
  noneOf?: Permission[];
  excludePrefixes?: string[];
  /**
   * Link to the path as written, without the gym-subdomain /dashboard prefix.
   *
   * For the storefront, which is a public page on the same host: everybody buys
   * there, member and visitor alike, so it must not be rewritten into the
   * staff-only dashboard store.
   */
  public?: boolean;
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
    // Orders and warehouses are their own entries below, so the catalog link
    // must not light up when the user is standing on one of them.
    excludePrefixes: [
      "/platform-commerce/orders",
      "/platform-commerce/returns",
      "/platform-commerce/warehouses",
    ],
  },
  {
    to: "/platform-commerce/orders",
    label: "Orders",
    icon: Package,
    anyOf: [Permission.PLATFORM_ORDERS_READ],
  },
  {
    to: "/platform-commerce/returns",
    label: "Returns",
    icon: RotateCcw,
    anyOf: [Permission.PLATFORM_ORDERS_READ],
  },
  {
    to: "/platform-commerce/warehouses",
    label: "Warehouses",
    icon: Warehouse,
    anyOf: [Permission.PLATFORM_PRODUCTS_READ],
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
    to: "/reminders",
    label: "Reminders",
    icon: BellRing,
    anyOf: [Permission.PAYMENTS_READ],
  },
  {
    to: "/subscriptions",
    label: "Subscriptions",
    icon: Package,
    anyOf: [Permission.SUBSCRIPTIONS_READ],
  },
  {
    to: "/coupons",
    label: "Coupons",
    icon: Tag,
    anyOf: [Permission.COUPONS_READ],
  },
  {
    // The shop itself. Public, and the only place anybody buys anything.
    to: "/store",
    label: "Store",
    icon: ShoppingBag,
    anyOf: [Permission.STORE_READ],
    public: true,
  },
  {
    // The other side of the counter: orders to hand over, payments to settle,
    // stock to correct. Not a shop, so it is not called one.
    to: "/store",
    label: "Store admin",
    icon: ClipboardList,
    anyOf: [Permission.STORE_MANAGE, Permission.STORE_SELL],
  },
  {
    to: "/attendance",
    label: "Attendance",
    icon: CalendarCheck,
    anyOf: [Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CHECKIN_SELF],
    // The machines live under this page and under Settings rather than in the
    // sidebar, so this stays lit while somebody is on them.
  },
  { to: "/orders/history", label: "My Orders", icon: ShoppingBag },
  {
    to: "/salary",
    label: "Staff salary",
    icon: BadgeIndianRupee,
    anyOf: [Permission.SALARY_READ],
  },
  {
    // Their own payslips. Staff who can see everybody's reach it through the
    // salary list instead, so this is hidden for them rather than duplicated.
    to: "/my-salary",
    label: "My salary",
    icon: BadgeIndianRupee,
    anyOf: [Permission.SALARY_READ_SELF],
    noneOf: [Permission.SALARY_READ],
  },
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
  const onTenantHost = isTenantSubdomain();
  const getTenantRoute = (path: string) => (onTenantHost ? getTenantDashboardPath(path) : path);

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
            <a href={tenantPublicUrl}>
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
          {/* Platform nav for super-admin / support.

              App host only. Platform work is not gym-scoped and has no route
              on a gym subdomain, so listing it there offered screens that
              address could not serve. The two scopes stay on their own
              addresses rather than linking across. */}
          {!onTenantHost && isPlatformStaff() && (
            <>
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Platform
              </p>
              {platformNav
                .filter(
                  (item) =>
                    (!item.anyOf?.length || canAny(...item.anyOf)) &&
                    !(item.noneOf?.length && canAny(...item.noneOf)),
                )
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

          {/* Tenant nav — the mirror of the rule above.

              A gym is served from its own address, so its pages are listed
              only there. `RequireTenantHost` still carries a deep link from
              the app host over to the gym, which is what a bookmark or a push
              notification needs; the sidebar simply does not advertise them
              from the wrong side. */}
          {onTenantHost && currentTenantId && (
            <>
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gym
              </p>
              {tenantNav
                .filter(
                  (item) =>
                    (!item.anyOf?.length || canAny(...item.anyOf)) &&
                    !(item.noneOf?.length && canAny(...item.noneOf)),
                )
                .map((item) => (
                  <NavLink
                    key={`${item.to}:${item.label}`}
                    to={item.public ? item.to : getTenantRoute(item.to)}
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
          <Menu>
            <MenuTrigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all duration-200 hover:bg-sidebar-accent">
              <span className="grid h-9 w-9 shrink-0 overflow-hidden rounded-md border-2 border-border bg-muted text-xs font-semibold text-muted-foreground">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user?.name ?? "User"}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="grid place-items-center">{getInitials(user?.name ?? "User")}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {user?.name ?? "User"}
                </span>
                <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
              </span>
              <ChevronUp className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem
                onClick={() => {
                  if (isMobile) setSidebarOpen(false);
                  navigate(getTenantRoute("/profile"));
                }}
              >
                <User />
                Profile
              </MenuItem>
              <MenuItem
                onClick={() => {
                  if (isMobile) setSidebarOpen(false);
                  window.location.assign(tenantPublicUrl);
                }}
              >
                <Globe />
                View Public Page
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut />
                Logout
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </aside>
    </>
  );
}
