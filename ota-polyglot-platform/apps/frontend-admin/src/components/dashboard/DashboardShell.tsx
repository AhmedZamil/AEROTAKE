"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthUser, fetchSession } from "@/lib/auth";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";

const SIDEBAR_KEY = "aerotake_sidebar_collapsed";

const LIVE_PATHS = new Set([
  "/fare/exchange-rates",
  "/fare/markup",
  "/partners/my-partners-list",
]);

type DashboardShellProps = {
  children: React.ReactNode;
  breadcrumb?: string;
};

export default function DashboardShell({
  children,
  breadcrumb,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then((session) => {
      if (cancelled) return;
      if (!session) {
        router.replace("/login");
        return;
      }
      setUser(session);
      const saved = localStorage.getItem(SIDEBAR_KEY);
      if (saved === "true") setCollapsed(true);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f3f6f9]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f3f6f9]">
      <div className="hidden shrink-0 lg:block">
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </div>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`absolute inset-y-0 left-0 flex h-full max-w-[86vw] transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar
            collapsed={false}
            mobile
            onCloseMobile={() => setMobileOpen(false)}
          />
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header
          user={user}
          breadcrumb={breadcrumb}
          onToggleSidebar={() => setMobileOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5 lg:p-6">
          {pathname && !LIVE_PATHS.has(pathname) && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Sample data from the admin mockup. Exchange rates, markup rules, and agencies are live for the signed-in tenant.
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
