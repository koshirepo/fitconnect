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
        {/* A narrower gutter on a phone than on a desktop: 16px here plus a
            card's own 16px inside put content 32px from the edge of a 375px
            screen, which is a sixth of the width spent on nothing. Twelve all
            round instead — enough that a title does not sit against the app
            header and a list does not end against the bottom of the screen,
            and little enough that the content gets the width. Screens built
            entirely from cards drop the side gutter — see the detail pages,
            which pull back out to full-bleed below `sm`. */}
        <main className="p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
