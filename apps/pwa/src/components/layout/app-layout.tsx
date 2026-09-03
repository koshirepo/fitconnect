import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import * as React from "react";
import { useSeo } from "@/lib/seo";

export function AppLayout() {
  const { sidebarOpen, setIsMobile } = useUIStore();

  /**
   * Nothing behind a login belongs in an index.
   *
   * Set once here rather than on forty screens, because every signed-in route
   * renders through this layout. robots.txt cannot do this job on its own: it
   * asks a crawler not to fetch a path, while a URL linked from elsewhere can
   * still be listed without ever being fetched. noindex is the instruction that
   * actually keeps it out, and it is the one a gym subdomain needs most — its
   * private screens all live under /dashboard, which the platform robots file
   * was never written for.
   */
  useSeo({ title: "Dashboard", noIndex: true });

  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [setIsMobile]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          "transition-[margin-left] duration-200",
          sidebarOpen ? "md:ml-64" : "ml-0",
        )}
      >
        <Header />
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
