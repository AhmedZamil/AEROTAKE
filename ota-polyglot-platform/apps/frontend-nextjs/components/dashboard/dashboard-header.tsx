"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { useRouter } from "next/navigation";
import { usePartnerProfile } from "./partner-profile";
import { useAuthSession } from "@/lib/use-auth-session";
import ProfileAvatar from "./profile-avatar";
import {
  BellIcon,
  ChatIcon,
  CheckIcon,
  ChevronDownIcon,
  LogoutIcon,
  MenuIcon,
  PencilIcon,
  SearchIcon,
  SettingsIcon,
  SidebarToggleIcon,
  TicketStubIcon,
} from "./icons";

type HeaderPanel = "notifications" | "messages" | "profile" | null;

const notifications = [
  {
    id: "n1",
    title: "Ticket issued",
    body: "PNR VQ8K2M confirmed for DAC → CXB.",
    time: "2 min ago",
    unread: true,
  },
  {
    id: "n2",
    title: "Fare change quotation",
    body: "BS 145 reissue quote is ready for review.",
    time: "28 min ago",
    unread: true,
  },
  {
    id: "n3",
    title: "Hold balance low",
    body: "Available hold balance is below BDT 5,000.",
    time: "1 hr ago",
    unread: true,
  },
  {
    id: "n4",
    title: "Support reply",
    body: "Your void request #AT-8841 has an update.",
    time: "Yesterday",
    unread: false,
  },
];

const messages = [
  {
    id: "m1",
    from: "AeroTake Support",
    preview: "We've processed the refund for booking ATK-9021.",
    time: "12 min ago",
    unread: true,
  },
  {
    id: "m2",
    from: "Operations Desk",
    preview: "Please reconfirm passenger names for PNR BG4L91.",
    time: "1 hr ago",
    unread: true,
  },
  {
    id: "m3",
    from: "Accounts",
    preview: "Invoice INV-22841 is ready to download.",
    time: "Yesterday",
    unread: false,
  },
];

export default function DashboardHeader({
  sidebarOpen,
  onMenuClick,
}: {
  sidebarOpen: boolean;
  onMenuClick: () => void;
}) {
  const router = useRouter();
  const { profile, identityLoading } = usePartnerProfile();
  const [panel, setPanel] = useState<HeaderPanel>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const unreadNotifications = notifications.filter((item) => item.unread).length;
  const unreadMessages = messages.filter((item) => item.unread).length;

  // Middleware only checks that a session cookie exists, not that it's still
  // valid — this is what actually detects a fully-dead (refresh-expired)
  // session and bounces back to login, since no protected data-fetching call
  // exists yet on this dashboard to trigger that detection on its own.
  const { loading: sessionLoading, authenticated } = useAuthSession();
  useEffect(() => {
    if (!sessionLoading && !authenticated) {
      router.push("/");
    }
  }, [sessionLoading, authenticated, router]);

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

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setPanel(null);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanel(null);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  function togglePanel(next: HeaderPanel) {
    setPanel((current) => (current === next ? null : next));
  }

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-black/4 bg-aerotake-white px-4 sm:px-6">
      <button
        type="button"
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        aria-pressed={sidebarOpen}
        onClick={onMenuClick}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-aerotake-navy hover:bg-aerotake-canvas"
      >
        <span className="lg:hidden">
          <MenuIcon />
        </span>
        <span className="hidden lg:inline">
          <SidebarToggleIcon collapsed={!sidebarOpen} />
        </span>
      </button>

      <label className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-aerotake-muted/70">
          <SearchIcon className="h-4 w-4" />
        </span>
        <input
          type="search"
          placeholder="Search PNR / Ticket No / Booking ID"
          className="h-11 w-full rounded-xl border border-transparent bg-[#f4f5f7] pr-4 pl-10 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted/70 focus:border-aerotake-coral/40 focus:bg-white focus:ring-2 focus:ring-aerotake-coral/15"
        />
      </label>

      <div className="relative flex shrink-0 items-center gap-1 sm:gap-2" ref={actionsRef}>
        <div className="relative">
          <button
            type="button"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={panel === "notifications"}
            onClick={() => togglePanel("notifications")}
            className={`relative flex h-10 w-10 items-center justify-center rounded-full text-aerotake-navy/80 hover:bg-aerotake-canvas ${
              panel === "notifications" ? "bg-aerotake-canvas text-aerotake-coral" : ""
            }`}
          >
            <BellIcon />
            {unreadNotifications > 0 ? (
              <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-aerotake-coral px-1 text-[9px] font-bold text-white">
                {unreadNotifications}
              </span>
            ) : null}
          </button>

          {panel === "notifications" ? (
            <div
              role="dialog"
              aria-label="Notifications"
              className="absolute top-full right-0 z-40 mt-2 w-[min(100vw-2rem,360px)] overflow-hidden rounded-xl border border-aerotake-border bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
            >
              <div className="flex items-center justify-between border-b border-aerotake-border px-4 py-3">
                <div>
                  <p className="text-[14px] font-semibold text-aerotake-navy">Notifications</p>
                  <p className="mt-0.5 text-[11px] text-aerotake-muted">
                    {unreadNotifications} unread update{unreadNotifications === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-aerotake-coral hover:underline"
                >
                  Mark all read
                </button>
              </div>
              <ul className="max-h-[360px] overflow-y-auto py-1">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-aerotake-canvas"
                    >
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          item.unread
                            ? "bg-[#fff1f0] text-aerotake-coral"
                            : "bg-[#f4f5f7] text-aerotake-muted"
                        }`}
                      >
                        {item.unread ? <TicketStubIcon className="h-4 w-4" /> : <CheckIcon />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={`truncate text-[13px] ${
                              item.unread
                                ? "font-semibold text-aerotake-navy"
                                : "font-medium text-aerotake-navy"
                            }`}
                          >
                            {item.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-aerotake-muted">
                            {item.time}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-4 text-aerotake-muted">
                          {item.body}
                        </span>
                      </span>
                      {item.unread ? (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-aerotake-coral" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-aerotake-border px-4 py-2.5">
                <Link
                  href="/dashboard/ticket-alert"
                  onClick={() => setPanel(null)}
                  className="block text-center text-[12px] font-semibold text-aerotake-coral hover:underline"
                >
                  View all alerts
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative hidden sm:block">
          <button
            type="button"
            aria-label="Messages"
            aria-haspopup="dialog"
            aria-expanded={panel === "messages"}
            onClick={() => togglePanel("messages")}
            className={`relative flex h-10 w-10 items-center justify-center rounded-full text-aerotake-navy/80 hover:bg-aerotake-canvas ${
              panel === "messages" ? "bg-aerotake-canvas text-aerotake-coral" : ""
            }`}
          >
            <ChatIcon />
            {unreadMessages > 0 ? (
              <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-aerotake-coral px-1 text-[9px] font-bold text-white">
                {unreadMessages}
              </span>
            ) : null}
          </button>

          {panel === "messages" ? (
            <div
              role="dialog"
              aria-label="Messages"
              className="absolute top-full right-0 z-40 mt-2 w-[min(100vw-2rem,360px)] overflow-hidden rounded-xl border border-aerotake-border bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
            >
              <div className="flex items-center justify-between border-b border-aerotake-border px-4 py-3">
                <div>
                  <p className="text-[14px] font-semibold text-aerotake-navy">Messages</p>
                  <p className="mt-0.5 text-[11px] text-aerotake-muted">
                    {unreadMessages} unread message{unreadMessages === 1 ? "" : "s"}
                  </p>
                </div>
                <Link
                  href="/dashboard/support"
                  onClick={() => setPanel(null)}
                  className="text-[11px] font-semibold text-aerotake-coral hover:underline"
                >
                  Open support
                </Link>
              </div>
              <ul className="max-h-[360px] overflow-y-auto py-1">
                {messages.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-aerotake-canvas"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff1f0] text-[11px] font-bold text-aerotake-coral">
                        {item.from
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span
                            className={`truncate text-[13px] ${
                              item.unread
                                ? "font-semibold text-aerotake-navy"
                                : "font-medium text-aerotake-navy"
                            }`}
                          >
                            {item.from}
                          </span>
                          <span className="shrink-0 text-[10px] text-aerotake-muted">
                            {item.time}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-aerotake-muted">
                          {item.preview}
                        </span>
                      </span>
                      {item.unread ? (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-aerotake-coral" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-aerotake-border px-4 py-2.5">
                <Link
                  href="/dashboard/support"
                  onClick={() => setPanel(null)}
                  className="block text-center text-[12px] font-semibold text-aerotake-coral hover:underline"
                >
                  View all messages
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={panel === "profile"}
            onClick={() => togglePanel("profile")}
            className="flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 hover:bg-aerotake-canvas sm:pr-2"
          >
            <ProfileAvatar
              name={profile.agencyName}
              avatarUrl={profile.avatarUrl}
              size="sm"
            />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate text-[13px] leading-4 font-semibold text-aerotake-navy">
                {identityLoading ? (
                  <span className="inline-block h-3 w-20 animate-pulse rounded bg-aerotake-border align-middle" />
                ) : (
                  profile.agencyName
                )}
              </span>
              <span className="mt-0.5 block text-[11px] text-aerotake-muted">
                {identityLoading ? (
                  <span className="inline-block h-2.5 w-14 animate-pulse rounded bg-aerotake-border align-middle" />
                ) : (
                  profile.agencyId
                )}
              </span>
            </span>
            <ChevronDownIcon
              className={`hidden h-4 w-4 text-aerotake-muted transition sm:block ${
                panel === "profile" ? "rotate-180" : ""
              }`}
            />
          </button>

          {panel === "profile" ? (
            <div
              role="menu"
              className="absolute top-full right-0 z-40 mt-2 w-[220px] overflow-hidden rounded-xl border border-aerotake-border bg-white py-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.14)]"
            >
              <div className="border-b border-aerotake-border px-3.5 py-2.5 sm:hidden">
                <p className="truncate text-[13px] font-semibold text-aerotake-navy">
                  {identityLoading ? (
                    <span className="inline-block h-3 w-24 animate-pulse rounded bg-aerotake-border align-middle" />
                  ) : (
                    profile.agencyName
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-aerotake-muted">
                  {identityLoading ? (
                    <span className="inline-block h-2.5 w-16 animate-pulse rounded bg-aerotake-border align-middle" />
                  ) : (
                    profile.agencyId
                  )}
                </p>
              </div>
              <Link
                href="/dashboard/profile"
                role="menuitem"
                onClick={() => setPanel(null)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-aerotake-navy hover:bg-aerotake-canvas"
              >
                <span className="text-aerotake-coral">
                  <PencilIcon />
                </span>
                Update Profile
              </Link>
              <Link
                href="/dashboard/account"
                role="menuitem"
                onClick={() => setPanel(null)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-aerotake-navy hover:bg-aerotake-canvas"
              >
                <span className="text-aerotake-coral">
                  <SettingsIcon />
                </span>
                Account Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                disabled={loggingOut}
                aria-busy={loggingOut}
                onClick={() => {
                  void handleLogout();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-aerotake-coral hover:bg-[#fff1f0] disabled:opacity-60"
              >
                {loggingOut ? <ButtonSpinner className="h-4 w-4" /> : <LogoutIcon className="h-4 w-4" />}
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
