"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import {
  LuBus,
  LuChevronDown,
  LuFileCheck,
  LuGift,
  LuGlobe,
  LuHotel,
  LuMenu,
  LuPlane,
  LuShoppingBag,
  LuShoppingCart,
  LuTreePalm,
  LuUser,
  LuX,
} from "react-icons/lu";
import { useApp } from "@/context/AppProviders";
import { SITE } from "@/lib/site";

type NavLink = {
  label: string;
  href: string;
  hasMenu?: boolean;
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

// Only what exists: the other sections of the mockup (hotels, shop, holidays, gift cards, visas, transport) had no pages behind them.
const navLinks: NavLink[] = [{ label: "Flight", href: "/", Icon: LuPlane }];

export default function Header() {
  const pathname = usePathname();
  const { user, logout } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const closeMenus = () => {
    setMenuOpen(false);
    setAccountOpen(false);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      closeMenus();
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card">
      <div className="relative z-30 px-[10px] md:px-[15px] xl:px-[30px]">
        <div className="relative mx-auto flex max-w-[1320px] items-center justify-between gap-3 py-3.5 sm:gap-4 sm:py-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link href="/" className="relative z-10 flex shrink-0 items-center" onClick={closeMenus}>
              <Image
                src="/aerotake_logo_black_orange.png"
                alt={`${SITE.name} — ${SITE.tagline}`}
                width={220}
                height={73}
                priority
                className="h-9 w-auto sm:h-10"
              />
            </Link>
          </div>

          <nav
            className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-4 text-[14px] font-medium text-navy xl:gap-5 xl:text-[15px] lg:flex"
            aria-label="Primary"
          >
            {navLinks.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              const Icon = link.Icon;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`inline-flex items-center gap-1.5 transition-colors hover:text-primary-strong ${
                    active ? "text-primary-strong" : ""
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {link.label}
                  {link.hasMenu ? (
                    <LuChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="relative z-10 flex items-center gap-1.5 sm:gap-2.5">
            <Link
              href="/my-bookings"
              aria-label="My bookings"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-navy hover:bg-primary-tint hover:text-primary-strong sm:h-11 sm:w-11"
            >
              <LuShoppingCart className="h-5 w-5" aria-hidden />
            </Link>

            {user ? (
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  aria-label="Account"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen((v) => !v)}
                  className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold sm:min-h-11"
                >
                  <LuUser className="h-4 w-4" aria-hidden />
                  <span className="max-w-[100px] truncate">{user.name || "Account"}</span>
                </button>
                {accountOpen ? (
                  <div className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-border bg-card p-2 shadow-lg">
                    <p className="truncate px-2 py-1 text-xs text-slate">{user.email}</p>
                    <Link
                      href="/my-bookings"
                      className="block min-h-11 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-bg"
                      onClick={closeMenus}
                    >
                      My Bookings
                    </Link>
                    <button
                      type="button"
                      disabled={signingOut}
                      aria-busy={signingOut}
                      className="flex w-full min-h-11 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-bg disabled:opacity-60"
                      onClick={() => void signOut()}
                    >
                      {signingOut ? <ButtonSpinner className="h-3.5 w-3.5" /> : null}
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                href="/login"
                className="btn-primary inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold sm:min-h-11 sm:px-5"
              >
                <LuUser className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Login</span>
              </Link>
            )}

            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-navy sm:h-11 sm:w-11 lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(true)}
            >
              <span className="sr-only">Open menu</span>
              <LuMenu className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-navy/50"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            className="absolute right-0 top-0 flex h-full w-[min(100%,320px)] flex-col bg-card p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="font-bold text-navy">Menu</p>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full text-navy"
                onClick={() => setMenuOpen(false)}
              >
                <LuX className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => {
                const Icon = link.Icon;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={closeMenus}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-semibold text-navy hover:bg-primary-tint"
                  >
                    <Icon className="h-5 w-5 text-primary-strong" aria-hidden />
                    {link.label}
                  </Link>
                );
              })}
              <Link
                href="/my-bookings"
                onClick={closeMenus}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-semibold text-navy hover:bg-primary-tint"
              >
                <LuShoppingCart className="h-5 w-5 text-primary-strong" aria-hidden />
                My Bookings
              </Link>
              <Link
                href="/manage-booking"
                onClick={closeMenus}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-semibold text-navy hover:bg-primary-tint"
              >
                <LuFileCheck className="h-5 w-5 text-primary-strong" aria-hidden />
                Manage Booking
              </Link>
              {user ? (
                <button
                  type="button"
                  disabled={signingOut}
                  aria-busy={signingOut}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-base font-semibold disabled:opacity-60"
                  onClick={() => void signOut()}
                >
                  {signingOut ? <ButtonSpinner className="h-5 w-5 text-primary-strong" /> : <LuUser className="h-5 w-5 text-primary-strong" aria-hidden />}
                  Sign out ({user.name})
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={closeMenus}
                  className="flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold text-primary-strong"
                >
                  <LuUser className="h-5 w-5" aria-hidden />
                  Login
                </Link>
              )}
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
