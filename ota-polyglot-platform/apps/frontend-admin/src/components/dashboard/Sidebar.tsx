"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import {
  LayoutDashboard,
  FileBarChart2,
  AlertTriangle,
  LineChart,
  ListOrdered,
  Layers3,
  Building2,
  Ticket,
  Handshake,
  Wallet,
  Users,
  Tags,
  Truck,
  MessageCircle,
  LifeBuoy,
  FileSpreadsheet,
  Newspaper,
  LayoutGrid,
  Globe2,
  Stamp,
  Megaphone,
  CircleHelp,
  Shield,
  Settings,
  PanelLeftClose,
  X,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { logout } from "@/lib/auth";

type NavItem = {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { label: string; href: string }[];
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Reports", href: "/reports", icon: FileBarChart2 },
  { label: "Issue Monitoring", href: "/issue-monitoring", icon: AlertTriangle },
  { label: "Sales Analytics", href: "/sales-analytics", icon: LineChart },
  { label: "Booking List", href: "/booking-list", icon: ListOrdered },
  { label: "B2C Booking Queues", href: "/b2c-booking-queues", icon: Layers3 },
  { label: "Supplier Bookings", href: "/supplier-bookings", icon: Building2 },
  {
    label: "Post Ticketing",
    icon: Ticket,
    children: [
      { label: "Void/Refund", href: "/void-refund" },
      { label: "Cancel requests", href: "/cancellations" },
    ],
  },
  {
    label: "Partner",
    icon: Handshake,
    children: [
      { label: "My Partners List", href: "/partners/my-partners-list" },
      { label: "Reseller & Partner", href: "/partners/reseller-partner" },
      { label: "New Partner Account Request", href: "/partners/request" },
      { label: "Branch", href: "/partners/branch" },
      { label: "Search Package", href: "/partners/search-package" },
      { label: "Partner Modules", href: "/partners/partner-modules" },
      { label: "Partner Info", href: "/partners/partner-info" },
      { label: "Zone", href: "#" },
      { label: "Account Manager", href: "#" },
      { label: "Membership", href: "/partners/membership" },
      { label: "Discount Coupons", href: "/partners/discount-coupon" },
      { label: "Email Alert Preferences", href: "/partners/email-alert-preferences" },
      { label: "API Logs", href: "/partners/api-logs" },
    ],
  },
  {
    label: "Finance",
    icon: Wallet,
    children: [
      { label: "Transactions", href: "#" },
      { label: "B2C Transactions", href: "#" },
      { label: "Balance Summary", href: "#" },
      { label: "TopUp Request", href: "#" },
      { label: "Void/Refund", href: "/void-refund" },
      { label: "Supplier Ledger", href: "#" },
      { label: "Invoices", href: "#" },
      { label: "Online Payment History", href: "#" },
      { label: "Offline Payment Channel", href: "#" },
      { label: "Payment Gateway", href: "#" },
      { label: "Exchange Rate", href: "/fare/exchange-rates" },
      { label: "Currency List", href: "#" },
      { label: "B2C User statement", href: "#" },
    ],
  },
  {
    label: "User Management",
    icon: Users,
    children: [
      { label: "Users", href: "#" },
      { label: "User Activity", href: "#" },
      { label: "User Type", href: "#" },
    ],
  },
  {
    label: "Fare Management",
    icon: Tags,
    children: [
      { label: "Fare Management Group", href: "#" },
      { label: "Exchange Rate", href: "/fare/exchange-rates" },
      { label: "Dynamic Markup", href: "/fare/markup" },
      { label: "Bank Card Discount", href: "#" },
      { label: "Location Based Tax", href: "#" },
      { label: "Override Markup", href: "#" },
      { label: "Fare Management Template", href: "#" },
    ],
  },
  {
    label: "Supplier",
    icon: Truck,
    children: [
      { label: "Suppliers List", href: "#" },
      { label: "Flight Firewall Rules", href: "#" },
      { label: "Airlines Commission", href: "#" },
      { label: "Group Booking Flight", href: "#" },
      { label: "Airport Codes", href: "#" },
      { label: "Airline Codes", href: "#" },
      { label: "Supplier Payment Card", href: "#" },
      { label: "Supplier Logs", href: "#" },
      { label: "Import Offline Booking", href: "#" },
      { label: "GDS Permitted Command", href: "#" },
      { label: "GDS Auto Ticketing Queues", href: "#" },
      { label: "GDS Terminal", href: "#" },
      { label: "Airport Auto Suggestion", href: "#" },
      { label: "Manual Booking Entry", href: "#" },
      { label: "Bulk Upload - Import offline booking", href: "#" },
    ],
  },
];

const footerItems: NavItem[] = [
  { label: "Support Chat", href: "#", icon: MessageCircle },
  { label: "Support Ticket", href: "#", icon: LifeBuoy },
  { label: "Subscriptions", href: "#", icon: FileSpreadsheet },
  {
    label: "Articles & Blog",
    icon: Newspaper,
    children: [
      { label: "My Articles/Blog", href: "#" },
      { label: "Content Category", href: "#" },
      { label: "Article Types", href: "#" },
    ],
  },
  {
    label: "Widgets",
    icon: LayoutGrid,
    children: [
      { label: "My Widgets", href: "#" },
      { label: "Top Activity", href: "#" },
      { label: "Home Banner", href: "#" },
      { label: "Top Hotel", href: "#" },
      { label: "Popular Destination", href: "#" },
      { label: "Popular Hotel", href: "#" },
      { label: "Top Airlines", href: "#" },
      { label: "Top Flights", href: "#" },
      { label: "Best Selling Flights", href: "#" },
      { label: "FAQ", href: "#" },
    ],
  },
  {
    label: "Tour Services",
    icon: Globe2,
    children: [
      { label: "Tour", href: "#" },
      { label: "Enlisted Supplier", href: "#" },
      { label: "Tour Service Booking", href: "#" },
      { label: "Tour Service", href: "#" },
    ],
  },
  {
    label: "Visa Services",
    icon: Stamp,
    children: [
      { label: "Visa", href: "#" },
      { label: "Enlisted Supplier", href: "#" },
      { label: "Visa Application", href: "#" },
      { label: "Visa Service", href: "#" },
      { label: "Visa Category", href: "#" },
    ],
  },
  {
    label: "Travel Insurance",
    icon: Shield,
    children: [
      { label: "Travel Insurance", href: "#" },
      { label: "Insurance Type", href: "#" },
      { label: "Booking List", href: "#" },
    ],
  },
  { label: "Broadcast & Marketing", href: "#", icon: Megaphone },
  { label: "Help Desk", href: "#", icon: CircleHelp },
  { label: "Settings", href: "#", icon: Settings },
];

type SidebarProps = {
  collapsed?: boolean;
  mobile?: boolean;
  onToggleCollapse?: () => void;
  onCloseMobile?: () => void;
};

export default function Sidebar({
  collapsed = false,
  mobile = false,
  onToggleCollapse,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [openMenus, setOpenMenus] = useState<string[]>([
    "Partner",
    "Post Ticketing",
    "Finance",
    "User Management",
    "Fare Management",
    "Supplier",
  ]);

  function toggleMenu(label: string) {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  function renderItem(item: NavItem) {
    const Icon = item.icon;
    const isActive = item.href === pathname;
    const hasChildren = !!item.children?.length;
    const isOpen = openMenus.includes(item.label) && !collapsed;

    if (hasChildren) {
      return (
        <div key={item.label} className="relative group/item">
          <button
            type="button"
            onClick={() => {
              if (collapsed) return;
              toggleMenu(item.label);
            }}
            title={collapsed ? item.label : undefined}
            className={`flex w-full items-center rounded-xl py-2.5 text-left text-[13px] font-medium text-white/90 transition-all duration-200 hover:bg-white/[0.08] hover:text-white ${
              collapsed ? "justify-center px-2" : "gap-3 px-3"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-white/80" />
            {!collapsed && (
              <>
                <span className="flex-1 truncate">{item.label}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-white/50 transition duration-200 ${isOpen ? "rotate-180 text-brand" : ""}`}
                />
              </>
            )}
          </button>
          {collapsed && (
            <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0b1220] px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover/item:opacity-100">
              {item.label}
            </span>
          )}
          {isOpen && (
            <div className="ml-4 space-y-0.5 border-l border-white/10 pl-3">
              {item.children!.map((child) => {
                const childActive = child.href === pathname;
                return (
                  <Link
                    key={child.label}
                    href={child.href}
                    className={`block rounded-lg px-3 py-2 text-[12.5px] transition-all duration-200 ${
                      childActive
                        ? "bg-brand/20 font-semibold text-white shadow-[inset_2px_0_0_0_#fc553b]"
                        : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {child.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <div key={item.label} className="relative group/item">
        <Link
          href={item.href || "#"}
          title={collapsed ? item.label : undefined}
          className={`flex items-center rounded-xl py-2.5 text-[13px] font-medium transition-all duration-200 ${
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          } ${
            isActive
              ? "bg-brand text-white shadow-lg shadow-brand/25"
              : "text-white/90 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <Icon
            className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-white/80"}`}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
        {collapsed && (
          <span className="pointer-events-none absolute top-1/2 left-full z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#0b1220] px-2 py-1 text-xs text-white opacity-0 shadow-lg transition group-hover/item:opacity-100">
            {item.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <aside
      className={`flex h-dvh shrink-0 flex-col overflow-hidden border-r border-white/5 bg-sidebar shadow-2xl shadow-black/30 transition-all duration-300 ease-in-out ${
        collapsed && !mobile ? "w-[80px]" : "w-[min(280px,86vw)] lg:w-[260px]"
      }`}
    >
      <div
        className={`flex h-14 shrink-0 items-center border-b border-white/5 sm:h-16 ${
          collapsed && !mobile
            ? "justify-center gap-1 px-2"
            : "justify-between gap-2 px-3"
        }`}
      >
        {collapsed && !mobile ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex h-10 w-10 items-center justify-center rounded-lg transition hover:bg-white/10"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <Image
              src="/aerotake_icon.png"
              alt="Aerotake"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
              priority
            />
          </button>
        ) : (
          <>
            <Image
              src="/verticle_logo_1.png"
              alt="Aerotake"
              width={160}
              height={42}
              className="h-8 w-auto min-w-0 flex-1 object-contain object-left sm:h-9"
              priority
            />
            {mobile ? (
              <button
                type="button"
                onClick={onCloseMobile}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/15 text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      <nav
        className={`sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden py-4 ${
          collapsed ? "px-2" : "px-2.5 pr-1.5"
        }`}
      >
        {navItems.map(renderItem)}
        <div className="my-3 mx-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        {footerItems.map(renderItem)}
      </nav>

      <div
        className={`shrink-0 border-t border-white/10 bg-sidebar ${
          collapsed ? "p-2" : "p-3"
        }`}
      >
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-busy={loggingOut}
          title={collapsed ? "Logout" : undefined}
          className={`flex w-full items-center rounded-lg py-2.5 text-[13px] font-medium text-white transition hover:bg-brand/15 hover:text-brand disabled:opacity-60 ${
            collapsed ? "justify-center px-2" : "gap-3 px-3"
          }`}
        >
          {loggingOut ? <ButtonSpinner className="h-4 w-4 shrink-0" /> : <LogOut className="h-4 w-4 shrink-0" />}
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
