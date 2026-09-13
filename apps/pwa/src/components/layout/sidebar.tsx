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
  CreditCard,
  Package,
  Tag,
  ClipboardList,
  TrendingUp,
  ShoppingBag,
  BadgeIndianRupee,
  RotateCcw,
  Warehouse,
  ScrollText,
  Briefcase,
  Award,
  ListTodo,
  Settings,
  LogOut,
  X,
  CalendarCheck,
  PlayCircle,
  Salad,
  Apple,
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

/**
 * A headed run of entries. A group whose entries are all hidden from the caller
 * is dropped whole, so nobody sees a heading with nothing under it.
 */
type NavGroup = { label?: string; items: NavItem[] };

/**
 * The platform's own screens, by what they are for.
 *
 * The libraries sit together because they are the same kind of work — curating
 * one catalogue every gym reads — even though each has its own permission.
 */
const platformNav: NavGroup[] = [
  {
    label: "Gyms",
    items: [
      {
        to: "/tenants",
        label: "Tenants",
        icon: Building2,
        anyOf: [Permission.PLATFORM_TENANTS_READ],
      },
    ],
  },
  {
    label: "Commerce",
    items: [
      {
        to: "/platform-commerce",
        label: "Products",
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
    ],
  },
  {
    label: "Libraries",
    items: [
      {
        to: "/platform-exercises",
        label: "Exercise library",
        icon: PlayCircle,
        anyOf: [Permission.PLATFORM_EXERCISES_MANAGE],
      },
      {
        to: "/platform-food-items",
        label: "Food library",
        icon: Apple,
        anyOf: [Permission.PLATFORM_FOOD_ITEMS_MANAGE],
      },
      {
        to: "/platform-occupations",
        label: "Occupations",
        icon: Briefcase,
        anyOf: [Permission.PLATFORM_OCCUPATIONS_MANAGE],
      },
    ],
  },
  {
    label: "Administration",
    items: [
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
    ],
  },
];

/**
 * A gym's screens, grouped by the job somebody opened the app to do.
 *
 * The sidebar lists destinations, not every screen. A page that is only ever
 * visited on the way from another is linked from that page instead:
 *
 * - Referrals, from Members — it is a view of who brought whom in.
 * - Reminders, from Payments — it is the record of chasing what is owed.
 * - Coins, from the dashboard and from Coupons — a figure to glance at, and the
 *   other half of the rewards a coupon grants.
 * - Store analytics, from Store admin. Roles, from Settings.
 * - The exercise and food libraries, from Workout Plans and Diet Plans, which
 *   are built out of them.
 */
const tenantNav: NavGroup[] = [
  {
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true }],
  },
  {
    label: "Members & attendance",
    items: [
      { to: "/members", label: "Members", icon: Users, anyOf: [Permission.MEMBERS_READ] },
      {
        to: "/attendance",
        label: "Attendance",
        icon: CalendarCheck,
        anyOf: [Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CHECKIN_SELF],
        // The machines live under this page and under Settings rather than in the
        // sidebar, so this stays lit while somebody is on them.
      },
      { to: "/badges", label: "Badges", icon: Award, anyOf: [Permission.BADGES_READ] },
    ],
  },
  {
    label: "Training",
    items: [
      {
        to: "/workouts",
        label: "Workout Plans",
        icon: Dumbbell,
        anyOf: [Permission.WORKOUTS_READ],
      },
      {
        to: "/diet-plans",
        label: "Diet Plans",
        icon: Salad,
        anyOf: [Permission.DIET_PLANS_READ],
      },
    ],
  },
  {
    label: "Payments & finance",
    items: [
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
        to: "/coupons",
        label: "Coupons",
        icon: Tag,
        anyOf: [Permission.COUPONS_READ],
      },
      {
        // The gym's performance and its books. Income and expenses, and the
        // salary list, are one click away from this page. It had no entry at
        // all before, and was reachable only from a dashboard tile.
        to: "/finance",
        label: "Analytics",
        icon: TrendingUp,
        anyOf: [Permission.PAYMENTS_ANALYTICS_READ],
      },
    ],
  },
  {
    label: "Store",
    items: [
      {
        // The shop itself. Public, and the only place anybody buys anything.
        //
        // Points at the storefront, not the counter. Both of these entries used to
        // lead to the same path, so whichever page won the route match served both
        // links and the other was unreachable from the sidebar.
        to: "/shop",
        label: "Store",
        icon: ShoppingBag,
        anyOf: [Permission.STORE_READ],
        public: true,
      },
      {
        // The other side of the counter: orders to hand over, payments to settle,
        // stock to correct. Not a shop, so it is not called one. Its analytics
        // are a button on the page, and this stays lit while somebody is there.
        to: "/dashboard/store",
        label: "Store admin",
        icon: ClipboardList,
        anyOf: [Permission.STORE_MANAGE, Permission.STORE_SELL],
      },
    ],
  },
  {
    label: "Me",
    items: [
      { to: "/orders/history", label: "My Orders", icon: ShoppingBag },
      {
        // Their own payslips. Staff who can see everybody's reach it through the
        // salary list instead, so this is hidden for them rather than duplicated.
        to: "/my-salary",
        label: "My salary",
        icon: BadgeIndianRupee,
        anyOf: [Permission.SALARY_READ_SELF],
        noneOf: [Permission.SALARY_READ],
      },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/todos", label: "Todos", icon: ListTodo, anyOf: [Permission.TODOS_READ] },
      {
        to: "/settings",
        label: "Settings",
        icon: Settings,
        anyOf: [Permission.SETTINGS_UPDATE],
      },
      {
        // Reached from Settings by anybody who can open Settings. Listed here
        // only for somebody who may read roles but not change settings, who
        // would otherwise have no way in.
        to: "/settings/roles",
        label: "Roles & Permissions",
        icon: ShieldCheck,
        anyOf: [Permission.ROLES_READ],
        noneOf: [Permission.SETTINGS_UPDATE],
      },
      { to: "/audit", label: "Audit Logs", icon: ScrollText, anyOf: [Permission.AUDIT_TENANT_READ] },
    ],
  },
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
  const [currentTenant, setCurrentTenant] = React.useState<Tenant | null>(null);

  const membership = currentMembership();
  const tenantPublicUrl = membership?.tenantSlug
    ? buildTenantPublicUrl(membership.tenantSlug)
    : currentTenant?.slug
      ? buildTenantPublicUrl(currentTenant.slug)
      : "/";
  const onTenantHost = isTenantSubdomain();
  const getTenantRoute = (path: string) => (onTenantHost ? getTenantDashboardPath(path) : path);

  /** Whether the caller holds what an entry asks for, and nothing that supersedes it. */
  const visible = (item: NavItem) =>
    (!item.anyOf?.length || canAny(...item.anyOf)) &&
    !(item.noneOf?.length && canAny(...item.noneOf));

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
              <NavGroups
                groups={platformNav}
                visible={visible}
                resolve={(item) => item.to}
                onNavigate={() => isMobile && setSidebarOpen(false)}
              />
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
              <NavGroups
                groups={tenantNav}
                visible={visible}
                resolve={(item) => (item.public ? item.to : getTenantRoute(item.to))}
                matchPrefix={getTenantRoute}
                onNavigate={() => isMobile && setSidebarOpen(false)}
              />
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

/**
 * One side of the sidebar, under its headings.
 *
 * `resolve` gives the address this host serves an entry at, and `matchPrefix`
 * does the same for the prefixes that keep an entry unlit.
 */
function NavGroups({
  groups,
  visible,
  resolve,
  matchPrefix = (path) => path,
  onNavigate,
}: {
  groups: NavGroup[];
  visible: (item: NavItem) => boolean;
  resolve: (item: NavItem) => string;
  matchPrefix?: (path: string) => string;
  onNavigate: () => void;
}) {
  const location = useLocation();

  return (
    <>
      {groups.map((group, index) => {
        const items = group.items.filter(visible);
        if (items.length === 0) return null;

        return (
          <div key={group.label ?? `group-${index}`} className={cn(index > 0 && "pt-3")}>
            {group.label && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {items.map((item) => (
                <NavLink
                  key={`${item.to}:${item.label}`}
                  to={resolve(item)}
                  end={item.exact}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent",
                      isActive &&
                        !item.excludePrefixes?.some((prefix) =>
                          location.pathname.startsWith(matchPrefix(prefix)),
                        ) &&
                        "bg-primary/10 text-primary border-l-2 border-primary",
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
