import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Login | AeroTake",
  description:
    "Login to AeroTake — access your account to manage bookings and explore the world.",
};

/**
 * Tenant headers stamped by middleware.ts (X-Tenant-ID, X-Brand-Name, etc.)
 * are available via next/headers in any server component below this layout,
 * but nothing renders from them yet — the theme's shells (AuthShell,
 * DashboardShell) hardcode "AeroTake" branding. Wiring white-label tenant
 * branding into those shells is a follow-up, not part of this theme port.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body
        className="min-h-full bg-aerotake-warm-white font-sans text-aerotake-navy"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
