"use client";

import {
  Bell,
  ChevronDown,
  Home,
  Menu,
  Search,
  Video,
} from "lucide-react";
import { AuthUser } from "@/lib/auth";

type HeaderProps = {
  user: AuthUser | null;
  breadcrumb?: string;
  onToggleSidebar?: () => void;
};

export default function Header({
  user,
  breadcrumb,
  onToggleSidebar,
}: HeaderProps) {
  const shortBreadcrumb = breadcrumb?.split(">").pop()?.trim() || breadcrumb;

  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:h-16 sm:gap-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 text-slate-400">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-700 transition hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Home className="hidden h-4 w-4 sm:block" />
        {breadcrumb && (
          <>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span className="hidden max-w-[220px] truncate text-sm font-medium text-slate-600 sm:inline">
              {breadcrumb}
            </span>
            <span className="max-w-[120px] truncate text-sm font-medium text-slate-700 sm:hidden">
              {shortBreadcrumb}
            </span>
          </>
        )}
      </div>

      <div className="mx-auto hidden min-w-0 max-w-xl flex-1 items-center md:flex">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Ctrl + K to search..."
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pr-4 pl-10 text-sm text-slate-700 outline-none transition focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/15"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 md:hidden"
          aria-label="Search"
        >
          <Search className="h-4.5 w-[18px] h-[18px]" />
        </button>
        <button
          type="button"
          className="hidden rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 sm:inline-flex"
          aria-label="Tutorials"
        >
          <Video className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-brand" />
        </button>

        <button
          type="button"
          className="ml-0.5 flex items-center gap-2 rounded-full border border-slate-200 py-1 pr-1 pl-1 transition hover:bg-slate-50 sm:pr-2.5"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
            {(user?.name || "A")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)}
          </div>
          <span className="hidden text-left md:inline">
            <span className="block text-sm font-medium text-slate-700">{user?.name || "Admin"}</span>
            {user?.tenantLabel && (
              <span className="block text-[11px] leading-tight text-slate-400">{user.tenantLabel}</span>
            )}
          </span>
          <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
        </button>
      </div>
    </header>
  );
}
