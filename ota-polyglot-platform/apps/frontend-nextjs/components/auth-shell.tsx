import Image from "next/image";
import type { ReactNode } from "react";

const features = [
  {
    title: "Global Inventory",
    detail: "Access 1000+ destinations worldwide.",
    icon: GlobeIcon,
  },
  {
    title: "Secure & Reliable",
    detail: "Enterprise-grade security you can trust.",
    icon: ShieldIcon,
  },
  {
    title: "Dedicated Support",
    detail: "24/7 partner assistance whenever you need it.",
    icon: HeadsetIcon,
  },
];

const heroImages = [
  {
    src: "/images/plane.png",
    alt: "Commercial airplane flying above the clouds",
    width: 1269,
    height: 1239,
  },
];

const activeHeroIndex = 0;

function HeroPlaneImage({ variant }: { variant: "mobile" | "desktop" }) {
  const hero = heroImages[activeHeroIndex] ?? heroImages[0];
  const isMobile = variant === "mobile";

  return (
    <Image
      src={hero.src}
      alt={hero.alt}
      fill
      priority
      sizes={isMobile ? "100vw" : "60vw"}
      className={
        isMobile
          ? "object-fill object-[50%_44%]"
          : "object-fill "
      }
    />
  );
}

export default function AuthShell({
  children,
  footer,
  showNav = false,
}: {
  children: ReactNode;
  footer?: ReactNode;
  showNav?: boolean;
}) {
  return (
    <>
      {/* Mobile layout */}
      <div className="flex min-h-dvh flex-col bg-aerotake-warm-white lg:hidden">
        <section className="relative h-[min(100vw,420px)] min-h-[280px] w-full">
          <div className="absolute inset-0 overflow-hidden bg-aerotake-navy">
            <HeroPlaneImage variant="mobile" />
          </div>

          <div className="relative z-10 flex items-start justify-between p-5 pt-6">
            <Image
              src="/images/verticle_logo_1.png"
              alt="Aerotake"
              width={1200}
              height={900}
              className="h-auto w-[140px] mix-blend-lighten"
            />
            {showNav ? <TopNav variant="light" /> : null}
          </div>
        </section>

        <section className="relative z-10 -mt-20 flex-1 rounded-t-[28px] bg-aerotake-warm-white px-6 pt-8 pb-10 shadow-[0_-8px_30px_rgba(15,23,42,0.08)]">
          {children}
          {footer}
        </section>
      </div>

      {/* Desktop layout */}
      <div className="hidden min-h-dvh bg-aerotake-warm-white lg:flex lg:h-dvh lg:flex-row lg:overflow-hidden">
        <section className="relative lg:h-full lg:w-[60%]">
          <div className="absolute inset-0 overflow-hidden bg-aerotake-navy">
            <HeroPlaneImage variant="desktop" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-aerotake-navy/80 via-aerotake-navy/45 to-transparent" />
            {/* <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-aerotake-navy/50 via-transparent to-aerotake-navy/30" /> */}
          </div>

          <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-12">
            <div>
              <Image
                src="/images/verticle_logo_1.png"
                alt="Aerotake"
                width={1200}
                height={900}
                className="h-auto w-[180px] mix-blend-lighten"
              />

              <div className="mt-14 xl:mt-16">
                <Slogan size="lg" />
                <p className="mt-5 max-w-md text-[13px] leading-6 text-white text-shadow-hero-sub xl:text-sm">
                  Power your business with real-time bookings, competitive
                  fares, and dedicated partner support.
                </p>
              </div>
            </div>

            <div>
              <div className="rounded-2xl bg-aerotake-navy/75 px-5 py-5 backdrop-blur-md xl:rounded-3xl xl:px-6 xl:py-6">
                <div className="grid grid-cols-3 gap-4 xl:gap-6">
                  {features.map((feature) => (
                    <div
                      key={feature.title}
                      className="flex min-w-0 items-center gap-3"
                    >
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-aerotake-white text-aerotake-coral shadow-sm [&_svg]:h-6 [&_svg]:w-6">
                        <feature.icon />
                      </span>

                      <div className="min-w-0">
                        <p className="text-base font-semibold text-white">
                          {feature.title}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-white/90">
                          {feature.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex justify-center gap-2">
                {heroImages.map((image, index) => (
                  <span
                    key={image.src}
                    className={
                      index === activeHeroIndex
                        ? "h-1.5 w-7 rounded-full bg-aerotake-coral"
                        : "h-1.5 w-4 rounded-full bg-aerotake-white/40"
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex w-[40%] min-w-[380px] flex-col overflow-y-auto bg-aerotake-warm-white px-8 py-8 xl:px-12">
          {showNav ? <TopNav variant="dark" className="relative z-10" /> : null}

          <div className="relative z-10 mx-auto flex w-full max-w-[460px] flex-1 flex-col">
            <div className="flex flex-1 items-center py-6">
              {children}
            </div>
            {footer}
          </div>
        </section>
      </div>
    </>
  );
}

export function OrDivider() {
  return (
    <div className="mt-6 flex items-center gap-4">
      <div className="h-px flex-1 bg-aerotake-border" />
      <span className="text-sm text-aerotake-muted">OR</span>
      <div className="h-px flex-1 bg-aerotake-border" />
    </div>
  );
}

export function ApiLink({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex w-full items-center gap-3 rounded-xl bg-aerotake-peach-mist px-4 py-3.5 ${className}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-aerotake-white text-aerotake-coral shadow-sm">
        <ApiIcon />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-aerotake-navy">API Access</p>
        <p className="mt-0.5 text-xs leading-4 text-aerotake-muted">
          Integrate and automate your operations
        </p>
      </div>

      <a
        href="#api"
        className="shrink-0 text-sm font-medium whitespace-nowrap text-aerotake-coral hover:underline"
      >
        Request for API →
      </a>
    </div>
  );
}

function Slogan({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <div>
      <p
        className={`whitespace-nowrap font-bold tracking-tight text-shadow-hero ${
          size === "lg"
            ? "text-[32px] leading-[1.15] xl:text-[38px] 2xl:text-[42px]"
            : "text-[26px] leading-[1.15]"
        }`}
      >
        <span className="text-white">Prestige in </span>
        <span className="text-aerotake-coral">motion</span>
      </p>
      <div className="mt-4 h-[3px] w-14 rounded-full bg-aerotake-coral" />
    </div>
  );
}

function TopNav({
  variant,
  className = "",
}: {
  variant: "light" | "dark";
  className?: string;
}) {
  const isLight = variant === "light";

  return (
    <nav
      className={`flex gap-6 text-sm ${isLight ? "" : "justify-end"} ${className}`}
    >
      <a
        href="/"
        className={`relative pb-1.5 font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-full after:bg-aerotake-coral ${
          isLight ? "text-white" : "text-aerotake-coral"
        }`}
      >
        Home
      </a>
      <a
        href="#about"
        className={`pb-1.5 ${
          isLight
            ? "text-white/85 hover:text-white"
            : "text-aerotake-muted hover:text-aerotake-navy"
        }`}
      >
        About Us
      </a>
    </nav>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.75 12h16.5M12 3.75c2.4 2.6 3.6 5.35 3.6 8.25S14.4 17.65 12 20.25C9.6 17.65 8.4 14.9 8.4 12S9.6 6.35 12 3.75Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M12 3.5 5 6.5v5.2c0 4.1 2.8 7.8 7 8.8 4.2-1 7-4.7 7-8.8V6.5L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 12.2 2.2 2.2 4.2-4.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M5 13V11a7 7 0 0 1 14 0v2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="3.5"
        y="12"
        width="4"
        height="6.5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="16.5"
        y="12"
        width="4"
        height="6.5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19 18.5v.8A2.7 2.7 0 0 1 16.3 22H14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ApiIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <path
        d="M9.5 7.5 5 12l4.5 4.5M14.5 7.5 19 12l-4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
