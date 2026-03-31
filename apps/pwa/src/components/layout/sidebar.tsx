import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
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
} from "lucide-react";
import AvatarCard from "../ui/avatarCard";

const platformNav = [
  {
    to: "/tenants",
    label: "Tenants",
    icon: Building2,
    roles: ["SUPER_ADMIN", "SUPPORT"],
  },
  {
    to: "/platform-commerce",
    label: "Commerce",
    icon: ShoppingBag,
    roles: ["SUPER_ADMIN", "SUPPORT"],
  },
  {
    to: "/platform-audit",
    label: "Audit Logs",
    icon: ScrollText,
    roles: ["SUPER_ADMIN", "SUPPORT"],
  },
];

const tenantNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/members", label: "Members", icon: Users, roles: ["ADMIN", "COACH"] },
  { to: "/todos", label: "Todos", icon: ListTodo, roles: ["ADMIN", "COACH"] },
  { to: "/workouts", label: "Workout Plans", icon: Dumbbell },
  { to: "/payments", label: "Payments", icon: CreditCard },
  { to: "/subscriptions", label: "Subscriptions", icon: Package },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck },
  { to: "/orders/history", label: "My Orders", icon: ShoppingBag },
  { to: "/badges", label: "Badges", icon: Award, roles: ["ADMIN"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["ADMIN"] },
  { to: "/audit", label: "Audit Logs", icon: ScrollText, roles: ["ADMIN"] },
];

export function Sidebar() {
  const {
    user,
    logout,
    currentTenantId,
    isPlatformStaff,
    tenantRole,
    currentMembership,
  } = useAuthStore();
  const { sidebarOpen, setSidebarOpen, isMobile } = useUIStore();
  const navigate = useNavigate();

  const membership = currentMembership();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const role = tenantRole();

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
            <img
              src="/icons/icon-96x96.png"
              alt="FitConnect"
              className="h-7 w-7 rounded-md shrink-0"
            />
            <span className="text-lg font-bold tracking-tight truncate text-gradient-brand">
              {membership ? membership.tenantName : "FitConnect"}
            </span>
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
                .filter(
                  (item) =>
                    !item.roles ||
                    item.roles.includes(user?.platformRole ?? ""),
                )
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => isMobile && setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent",
                        isActive &&
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
                .filter((item) => {
                  if (!item.roles) return true;
                  return item.roles.includes(role ?? "");
                })
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => isMobile && setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent",
                        isActive &&
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
            to="/profile"
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
