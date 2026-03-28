import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/utils";
import * as React from "react";

export function AppLayout() {
  const { sidebarOpen, setIsMobile } = useUIStore();

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
