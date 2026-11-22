"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import {
  BookingsIcon,
  GridIcon,
  LogoutIcon,
  PassengersIcon,
  PriceCheckIcon,
  QuotationIcon,
  ReportsIcon,
  SearchIcon,
  SupportIcon,
  TicketAlertIcon,
  WalletIcon,
} from "./icons";
import type { TenantContext } from "@/lib/tenants";

const navItems: {
  href: string;
  label: string;
  icon: typeof GridIcon;
  devOnly?: boolean;
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: GridIcon },
  { href: "/dashboard/search", label: "Search", icon: SearchIcon },
  { href: "/dashboard/price-check", label: "Price Check", icon: PriceCheckIcon, devOnly: true },
  { href: "/dashboard/bookings", label: "Bookings", icon: BookingsIcon },
  { href: "/dashboard/ticket-alert", label: "Ticket Alert", icon: TicketAlertIcon },
  { href: "/dashboard/hold-balance", label: "Hold Balance", icon: WalletIcon },
  {
    href: "/dashboard/fare-quotation",
    label: "Fare Change Quotation",
    icon: QuotationIcon,
  },
  { href: "/dashboard/support", label: "Support", icon: SupportIcon },
  { href: "/dashboard/reports", label: "Reports", icon: ReportsIcon },
  { href: "/dashboard/passengers", label: "Passengers", icon: PassengersIcon },
];

export default function DashboardSidebar({
  collapsed = false,
  onNavigate,
  branding,
  showPriceCheck = false,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  branding: TenantContext["branding"];
  showPriceCheck?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
    }
  }

  return (
    <aside
      className={`flex h-full shrink-0 flex-col bg-aerotake-sidebar text-white ${
        collapsed ? "w-[72px]" : "w-[248px]"
      }`}
    >
      <div className={collapsed ? "flex justify-center px-2 pt-5 pb-3" : "px-4 pt-5 pb-3"}>
        <Link
          href="/dashboard"
          className="block"
          onClick={onNavigate}
          title={branding.name}
        >
          {collapsed ? (
            // Collapsed state keeps the default square icon regardless of
            // tenant — a dedicated collapsed-icon asset per tenant is
            // beyond what "branding placeholder" calls for; the full
            // tenant logo below (the more prominent, default state) is
            // where per-tenant branding actually matters.
            <span className="relative block h-10 w-10 overflow-hidden">
              <Image
                src="/images/aerotake_icon.png"
                alt="Aerotake"
                fill
                sizes="40px"
                className="object-contain"
              />
            </span>
          ) : (
            <span className="relative block h-12 w-full">
              <Image
                src={branding.logoUrl}
                alt={branding.name}
                fill
                sizes="216px"
                className="object-contain object-left mix-blend-lighten"
              />
            </span>
          )}
        </Link>
      </div>

      <nav className={`flex-1 space-y-0.5 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
        {navItems
          .filter((item) => !item.devOnly || showPriceCheck)
          .map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              onClick={onNavigate}
              className={`flex items-center rounded-lg text-[13px] transition-colors ${
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
              } ${
                active
                  ? "bg-aerotake-coral font-medium text-white shadow-[0_8px_16px_rgba(249,115,96,0.28)]"
                  : "text-white/70 hover:bg-white/6 hover:text-white"
              }`}
            >
              <item.icon />
              {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
            </Link>
          );
        })}
      </nav>

      {collapsed ? null : (
        <div className="px-4 pt-4">
          <div className="relative overflow-hidden rounded-2xl bg-white p-4 pt-5 shadow-sm">
            <p className="relative z-10 max-w-[130px] text-[13px] leading-5 font-semibold text-aerotake-navy">
              Get 10% OFF On Your Next Booking
            </p>
            <button
              type="button"
              className="relative z-10 mt-3 rounded-lg bg-aerotake-coral px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-aerotake-coral-dark"
            >
              Explore Deals
            </button>
            <SidebarPlane />
          </div>
        </div>
      )}

      <div
        className={`mt-auto flex items-center py-3.5 text-[10px] leading-4 text-white/40 ${
          collapsed ? "justify-center px-2" : "justify-between gap-2 px-5"
        }`}
      >
        {collapsed ? null : (
          <p>
            © {new Date().getFullYear()} {branding.name}
            <br />
            All rights reserved
          </p>
        )}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-busy={loggingOut}
          aria-label="Log out"
          title="Log out"
          className="rounded-md p-1.5 text-white/55 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-60"
        >
          {loggingOut ? <ButtonSpinner className="h-4 w-4" /> : <LogoutIcon />}
        </button>
      </div>
    </aside>
  );
}

function SidebarPlane() {
  return (
    <svg
      viewBox="0 0 120 72"
      className="pointer-events-none absolute -right-3 -bottom-1 h-[84px] w-[132px]"
      aria-hidden
    >
      <ellipse cx="78" cy="58" rx="28" ry="6" fill="#f97360" opacity="0.12" />
      <path
        d="M14 42c18-6 38-14 62-18 8-10 16-16 22-18 2-.6 3.4 1.6 2.2 3.2-3.4 4.6-8.4 9.8-12 13.2 12-1 22-.4 28 1.2 2 .6 1.6 3.4-.6 3.6-9.4.8-22.2.2-32.8-1.2-6.8 7.4-16.4 16-28.2 22.2-1.6.8-3.4-.6-2.8-2.2 1.8-5.2 5.4-11.4 8.6-16.2C38 32 26 36 16 39c-2 .6-3.2-1.4-2-3Z"
        fill="#0f172a"
      />
      <path
        d="M76 26c6 1.4 14 2 22 1.4"
        stroke="#f97360"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="98" cy="24" r="2.2" fill="#f97360" />
    </svg>
  );
}
