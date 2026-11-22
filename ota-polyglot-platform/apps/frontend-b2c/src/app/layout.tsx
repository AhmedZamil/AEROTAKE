import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Syne } from "next/font/google";
import FloatingUI from "@/components/FloatingUI";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { AppProviders } from "@/context/AppProviders";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Aerotake — Plan. Book. Fly.",
    template: "%s — Aerotake",
  },
  description:
    "Search and book flights with Aerotake. Compare fares and book flights — Plan. Book. Fly.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-hidden font-sans">
        <AppProviders>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <FloatingUI />
        </AppProviders>
      </body>
    </html>
  );
}
