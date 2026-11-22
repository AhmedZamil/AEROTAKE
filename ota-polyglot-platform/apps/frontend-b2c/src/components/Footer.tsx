"use client";

import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/site";

const quickLinks = [
  { label: "Home", href: "/" },
  { label: "About Us", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "My Bookings", href: "/my-bookings" },
  { label: "Contact Us", href: "/contact" },
];

const legalLinks = [
  { label: "FAQ", href: "/faq" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Refund Policy", href: "/refund-policy" },
];

const socials = [
  {
    label: "Facebook",
    href: "https://www.facebook.com",
    path: "M14 8.2h-1.4V7c0-.4.2-.7.8-.7H14V4.2h-1.6C10.6 4.2 10 5.4 10 6.8v1.4H8.5V11H10v5h2.6v-5H14l.4-2.8Z",
  },
  {
    label: "X",
    href: "https://x.com",
    path: "M17.5 6.3c-.5.2-1 .4-1.5.4.6-.3 1-.8 1.2-1.4-.5.3-1.1.5-1.7.7A2.4 2.4 0 0 0 12.4 5c-1.3 0-2.4 1.1-2.4 2.4 0 .2 0 .4.1.5A6.8 6.8 0 0 1 5 5.5a2.4 2.4 0 0 0 .7 3.2c-.4 0-.8-.1-1.1-.3v.1c0 1.2.8 2.1 1.9 2.4-.2.1-.4.1-.7.1-.2 0-.3 0-.5-.1.3 1 1.3 1.8 2.4 1.8A4.8 4.4 0 0 1 5 14.2 6.8 6.8 0 0 0 8.7 15c4.4 0 6.8-3.6 6.8-6.8v-.3c.5-.3.9-.8 1.2-1.3l-.2-.1Z",
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com",
    path: "M12 7.2A2.8 2.8 0 1 0 12 12.8 2.8 2.8 0 0 0 12 7.2Zm0 4.6a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Zm3.6-4.8a.7.7 0 1 1-1.4 0 .7.7 0 0 1 1.4 0Zm2 1a3.5 3.5 0 0 0-1-2.5 3.5 3.5 0 0 0-2.5-1H10A3.5 3.5 0 0 0 7.4 5.5 3.5 3.5 0 0 0 6.5 8v4a3.5 3.5 0 0 0 1 2.5A3.5 3.5 0 0 0 10 16.5h4a3.5 3.5 0 0 0 2.5-1 3.5 3.5 0 0 0 1-2.5V8Zm-1 4a2.5 2.5 0 0 1-.7 1.8A2.5 2.5 0 0 1 14 15.5h-4a2.5 2.5 0 0 1-1.8-.7A2.5 2.5 0 0 1 7.5 12V8a2.5 2.5 0 0 1 .7-1.8A2.5 2.5 0 0 1 10 5.5h4a2.5 2.5 0 0 1 1.8.7A2.5 2.5 0 0 1 16.5 8v4Z",
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-navy text-white">
      <div className="relative z-10 mx-auto max-w-[1320px] px-4 pb-16 pt-14 sm:px-6 lg:px-8 lg:pt-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_0.8fr_1.2fr] xl:gap-8">
          <div>
            <Link href="/" className="mb-4 inline-flex items-center">
              <Image
                src="/verticle_logo_1.png"
                alt={`${SITE.name} — ${SITE.tagline}`}
                width={200}
                height={67}
                className="h-12 w-auto"
              />
            </Link>
            <p className="mb-6 max-w-sm text-[15px] leading-relaxed text-white/75">
              We craft memorable journeys with handpicked destinations, expert
              guides, and seamless flight booking for every explorer.
            </p>

            <form
              className="relative mb-6 max-w-sm"
              onSubmit={(event) => event.preventDefault()}
            >
              <label htmlFor="footer-email" className="sr-only">
                Email for newsletter
              </label>
              <input
                id="footer-email"
                type="email"
                placeholder="Enter your email"
                className="input-field h-12 w-full rounded-full pr-14 pl-5 text-base placeholder:text-slate"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="btn-primary absolute right-1.5 top-1/2 flex h-9 w-9 min-h-9 -translate-y-1/2 items-center justify-center rounded-full"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M11.8 7.5 5.7 1.2A1.1 1.1 0 0 0 4.2 1.2l-.4.5a1.1 1.1 0 0 0 0 1.5L9.3 8l-5.1 5.2a1.1 1.1 0 0 0 0 1.6l.4.4a1.1 1.1 0 0 0 1.5 0l6.1-6.2a1.1 1.1 0 0 0 0-1.1Z" />
                </svg>
              </button>
            </form>

            <div className="flex flex-wrap gap-2.5">
              {socials.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-primary-strong"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                    <path d={social.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-5 text-lg font-bold">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[15px] text-white/80 transition hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-lg font-bold">Legal</h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[15px] text-white/80 transition hover:text-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-lg font-bold">Information</h3>
            <ul className="space-y-4 text-[15px] text-white/80">
              <li className="flex items-start gap-3">
                <svg
                  viewBox="0 0 20 20"
                  className="mt-0.5 h-5 w-5 shrink-0 text-white"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M10 2a5.5 5.5 0 0 0-5.5 5.5C4.5 11.2 10 18 10 18s5.5-6.8 5.5-10.5A5.5 5.5 0 0 0 10 2Zm0 7.5A2 2 0 1 1 10 5.5a2 2 0 0 1 0 4Z" />
                </svg>
                <span>{SITE.address}</span>
              </li>
              <li className="flex items-center gap-3">
                <svg
                  viewBox="0 0 20 20"
                  className="h-5 w-5 shrink-0 text-white"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M4.2 2.8c.3-.3.8-.4 1.2-.2l2.4 1c.4.2.7.6.7 1.1v2.2c0 .3-.1.6-.4.8l-1.3 1c.8 1.7 2.1 3.1 3.8 3.8l1-1.3c.2-.3.5-.4.8-.4h2.2c.5 0 .9.3 1.1.7l1 2.4c.2.4.1.9-.2 1.2l-1.4 1.4c-.3.3-.8.5-1.2.4C8.3 16.3 3.7 11.7 2.4 5.6c-.1-.4.1-.9.4-1.2L4.2 2.8Z" />
                </svg>
                <a href={`tel:${SITE.phoneTel}`} className="hover:text-primary">
                  {SITE.phoneDisplay}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <svg
                  viewBox="0 0 20 20"
                  className="mt-0.5 h-5 w-5 shrink-0 text-white"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M10 1.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Zm0 1.5a6.7 6.7 0 1 1 0 13.4 6.7 6.7 0 0 1 0-13.4Zm-.7 2.3h1.4v4.1l2.8 1.7-.7 1.2-3.5-2.1V5.6Z" />
                </svg>
                <span>{SITE.hours}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <div className="relative z-10 mx-auto flex max-w-[1320px] items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-white/55">
            Copyright © {SITE.name} | All Rights Reserved · {SITE.tagline}
          </p>
        </div>
      </div>
    </footer>
  );
}
