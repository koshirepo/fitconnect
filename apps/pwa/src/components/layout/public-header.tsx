import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { resolvePrivateHome } from "@/lib/session-scope";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import {
  Menu as AccountMenu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getInitials } from "@fitconnect/shared";
import { ArrowRight, ChevronDown, LayoutDashboard, LogOut, Menu, X } from "lucide-react";

interface NavItem {
  label: string;
  href?: string;
  to?: string;
}

interface PublicHeaderProps {
  navItems?: NavItem[];
  maxWidth?: string;
}

export function PublicHeader({ navItems = [], maxWidth = "max-w-7xl" }: PublicHeaderProps) {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [open, setOpen] = React.useState(false);

  /**
   * Where this account's private area is, which need not be on this host.
   *
   * These pages are the platform's own, but a gym's member is just as likely to
   * be reading them — the exercise library is public and shared by every gym —
   * and their dashboard lives on their gym's address, not this one.
   */
  const home = resolvePrivateHome(user);

  const goHome = () => {
    setOpen(false);
    if (!home) return;
    // A different origin has to be loaded, not routed to.
    if (home.external) window.location.assign(home.href);
    else navigate(home.href);
  };

  const signOut = () => {
    setOpen(false);
    logout();
    navigate("/");
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div
          className={cn(
            "mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8",
            maxWidth,
          )}
        >
          <div className="flex items-center gap-2">
            {/* Mobile hamburger */}
            {navItems.length > 0 && (
              <button className="md:hidden" onClick={() => setOpen(true)}>
                <Menu className="h-5 w-5" />
              </button>
            )}
            <Link to="/" className="flex items-center gap-2 font-bold text-xl">
              <img src="/icons/whiteLogo.png" alt="FitConnect" className="h-7 rounded-md" />
              <span className="text-gradient-brand">FitConnect</span>
            </Link>
          </div>

          {/* Desktop nav */}
          {navItems.length > 0 && (
            <nav className="hidden md:flex items-center gap-6 text-sm">
              {navItems.map((item) =>
                item.to ? (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="hover:text-primary transition-colors"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.label}
                    href={item.href}
                    className="hover:text-primary transition-colors"
                  >
                    {item.label}
                  </a>
                ),
              )}
            </nav>
          )}

          <div className="flex items-center gap-3">
            <ModeToggle />
            {isAuthenticated ? (
              /* Who you are signed in as, rather than a bare button. These
                 pages are public but the session is not host-specific any
                 more, so somebody arriving from their gym should see their own
                 account here and not be invited to sign in again. */
              <AccountMenu>
                <MenuTrigger className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted">
                  <span className="grid h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="grid place-items-center">
                        {getInitials(user?.name ?? "User")}
                      </span>
                    )}
                  </span>
                  <span className="hidden min-w-0 flex-col sm:flex">
                    <span className="truncate text-sm leading-tight font-medium">
                      {user?.name ?? "Account"}
                    </span>
                    {user?.membership?.tenantName && (
                      <span className="truncate text-[11px] leading-tight text-muted-foreground">
                        {user.membership.tenantName}
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </MenuTrigger>

                <MenuContent align="end" side="bottom">
                  {/* Absent for an account with nothing private anywhere — a
                      member mid-signup, before a membership exists. */}
                  {home && (
                    <MenuItem onClick={goHome}>
                      <LayoutDashboard />
                      Dashboard
                    </MenuItem>
                  )}
                  {home && <MenuSeparator />}
                  <MenuItem
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    onClick={signOut}
                  >
                    <LogOut />
                    Sign out
                  </MenuItem>
                </MenuContent>
              </AccountMenu>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/login")}
                  className="hidden sm:inline-flex"
                >
                  Sign In
                </Button>
                <Button onClick={() => navigate("/login")}>
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="absolute left-0 top-0 h-full w-64 bg-background border-r shadow-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-16 items-center justify-between border-b px-4">
              <span className="font-bold text-lg">Menu</span>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1">
              {navItems.map((item) =>
                item.to ? (
                  <Link
                    key={item.label}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <a
                    key={item.label}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
                  >
                    {item.label}
                  </a>
                ),
              )}
            </nav>
            <div className="border-t p-4 space-y-2">
              {isAuthenticated ? (
                <>
                  {/* The name is worth the line on a phone too: it is the only
                      thing here that says which account this is. */}
                  <p className="truncate px-1 pb-1 text-sm font-medium">
                    {user?.name ?? "Account"}
                  </p>
                  {home && (
                    <Button className="w-full" onClick={goHome}>
                      Dashboard
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="outline" className="w-full" onClick={signOut}>
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      navigate("/login");
                    }}
                  >
                    Sign In
                  </Button>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      navigate("/login");
                    }}
                  >
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
