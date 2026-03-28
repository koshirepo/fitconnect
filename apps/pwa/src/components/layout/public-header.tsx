import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Menu, X } from "lucide-react";

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
  const { isAuthenticated } = useAuthStore();
  const [open, setOpen] = React.useState(false);

  const handleNav = (item: NavItem) => {
    setOpen(false);
    if (item.to) {
      navigate(item.to);
    } else if (item.href) {
      window.location.href = item.href;
    }
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
            {isAuthenticated ? (
              <Button onClick={() => navigate("/dashboard")}>
                Dashboard
                <ArrowRight className="h-4 w-4" />
              </Button>
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
              {navItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleNav(item)}
                  className="flex w-full items-center rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="border-t p-4 space-y-2">
              {isAuthenticated ? (
                <Button
                  className="w-full"
                  onClick={() => {
                    setOpen(false);
                    navigate("/dashboard");
                  }}
                >
                  Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>
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
