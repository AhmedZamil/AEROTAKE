"use client";

import { createContext, useContext, useMemo, useState } from "react";
import DashboardHeader from "./dashboard-header";
import DashboardSidebar from "./dashboard-sidebar";
import { PartnerProfileProvider, type PartnerIdentity } from "./partner-profile";
import { ChatIcon, CloseIcon, PhoneIcon } from "./icons";
import type { TenantContext } from "@/lib/tenants";

const LG_QUERY = "(min-width: 1024px)";

const SidebarControlContext = createContext<{
  collapse: () => void;
} | null>(null);

export function useDashboardSidebar() {
  return useContext(SidebarControlContext);
}

export default function DashboardShell({
  children,
  identity,
  branding,
  showPriceCheck = false,
}: {
  children: React.ReactNode;
  identity: PartnerIdentity;
  branding: TenantContext["branding"];
  showPriceCheck?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggleSidebar() {
    if (window.matchMedia(LG_QUERY).matches) {
      setSidebarOpen((open) => !open);
      return;
    }

    setMobileOpen((open) => !open);
  }

  const sidebarControl = useMemo(
    () => ({ collapse: () => setSidebarOpen(false) }),
    [],
  );

  return (
    <PartnerProfileProvider identity={identity} branding={branding}>
    <SidebarControlContext.Provider value={sidebarControl}>
    <div className="flex h-dvh overflow-hidden bg-aerotake-canvas text-aerotake-navy">
      <div
        className={`hidden shrink-0 overflow-hidden transition-[width] duration-300 ease-out lg:block ${
          sidebarOpen ? "w-[248px]" : "w-[72px]"
        }`}
      >
        <DashboardSidebar collapsed={!sidebarOpen} branding={branding} showPriceCheck={showPriceCheck} />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-aerotake-navy/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[248px] shadow-2xl">
            <DashboardSidebar onNavigate={() => setMobileOpen(false)} branding={branding} showPriceCheck={showPriceCheck} />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          sidebarOpen={sidebarOpen}
          onMenuClick={toggleSidebar}
        />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <div className="pointer-events-none fixed right-5 bottom-5 z-40 flex flex-col items-center gap-3">
        <button
          type="button"
          aria-label="Open chat"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-aerotake-coral text-white shadow-[0_10px_24px_rgba(249,115,96,0.4)] hover:bg-aerotake-coral-dark"
        >
          <ChatIcon className="h-[22px] w-[22px]" />
        </button>
        <button
          type="button"
          aria-label="Call support"
          className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-aerotake-coral text-white shadow-[0_10px_24px_rgba(249,115,96,0.4)] hover:bg-aerotake-coral-dark"
        >
          <PhoneIcon className="h-[20px] w-[20px]" />
        </button>
      </div>
    </div>
    </SidebarControlContext.Provider>
    </PartnerProfileProvider>
  );
}
