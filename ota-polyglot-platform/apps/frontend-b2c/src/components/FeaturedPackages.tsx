import Image from "next/image";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";

type BadgeKind = "sale" | "featured";

type Package = {
  image: string;
  location: string;
  days: string;
  title: string;
  route: string;
  price: string;
  oldPrice?: string;
  saleLabel?: string;
  badge: { label: string; kind: BadgeKind; crown?: boolean };
  action: "view" | "globe";
  play?: boolean;
  dots?: boolean;
};

const packages: Package[] = [
  {
    image: "/images/packages/maldives.jpg",
    location: "Maldives",
    days: "04 days",
    title: "Maldives & Dubai Luxury Escape",
    route: "Male City → Maafushi Island → Dubai Marina → Desert Safari",
    price: "$1099",
    saleLabel: "Sale on!",
    badge: { label: "Group tour", kind: "featured" },
    action: "view",
    play: true,
  },
  {
    image: "/images/packages/bali.jpg",
    location: "Bali",
    days: "07 days",
    title: "Bali Tropical Island Retreat",
    route: "Ubud → Seminyak → Nusa Penida → Uluwatu",
    price: "$329",
    oldPrice: "$399",
    saleLabel: "Sale on!",
    badge: { label: "Family Tour", kind: "featured" },
    action: "view",
    dots: true,
  },
  {
    image: "/images/packages/switzerland.jpg",
    location: "Switzerland",
    days: "12 days",
    title: "Switzerland Alpine Escape",
    route: "Zurich → Lucerne → Interlaken → Zermatt",
    price: "$1899",
    saleLabel: "Sale on!",
    badge: { label: "Featured", kind: "featured" },
    action: "globe",
  },
  {
    image: "/images/packages/srilanka.jpg",
    location: "Sri Lanka",
    days: "08 days",
    title: "Sri Lanka Cultural Heritage Trail",
    route: "Colombo → Kandy → Ella → Galle Fort",
    price: "$719",
    oldPrice: "$799",
    saleLabel: "Sale on!",
    badge: { label: "10% Off", kind: "sale" },
    action: "view",
    dots: true,
  },
  {
    image: "/images/packages/thailand.jpg",
    location: "Thailand",
    days: "06 days",
    title: "Thailand Beach Paradise Escape",
    route: "Bangkok → Phuket → Phi Phi → Krabi",
    price: "$599",
    saleLabel: "Sale on!",
    badge: { label: "Best seller", kind: "featured", crown: true },
    action: "globe",
  },
  {
    image: "/images/packages/dubai.jpg",
    location: "Dubai",
    days: "05 days",
    title: "Dubai Luxury Desert Adventure",
    route: "Dubai City → Palm Jumeirah → Desert → Abu Dhabi",
    price: "$849",
    saleLabel: "Sale on!",
    badge: { label: "Best seller", kind: "featured", crown: true },
    action: "view",
  },
];

const badgeClass: Record<BadgeKind, string> = {
  sale: "badge-sale",
  featured: "badge-featured",
};

export default function FeaturedPackages() {
  return (
    <section id="packages" className="overflow-x-hidden bg-bg px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <Reveal className="mb-8 flex items-end justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-navy max-md:text-[26px] sm:text-4xl">
            Features Travel Package
          </h2>
          <a
            href="/flights?from=DAC&to=DXB&depart=2026-10-05&adults=1&children=0&infants=0&cabin=economy&trip=oneway"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-strong transition hover:text-primary-hover"
          >
            <span className="md:hidden">View all</span>
            <span className="hidden md:inline">View all package</span>
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </Reveal>

        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          {packages.map((pkg) => (
            <article
              key={`mobile-${pkg.title}`}
              className="flex w-[82%] shrink-0 snap-start flex-col overflow-hidden rounded-[16px] border border-border bg-card shadow-sm"
            >
              <div className="relative h-[188px] shrink-0 overflow-hidden">
                <Image
                  src={pkg.image}
                  alt={pkg.title}
                  fill
                  sizes="82vw"
                  className="object-cover"
                />

                <button
                  type="button"
                  aria-label="Add to wishlist"
                  className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card/95 text-navy shadow-sm"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden
                  >
                    <path
                      d="M12 20s-7-4.4-7-9.2A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19 10.8C19 15.6 12 20 12 20Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
                  {pkg.saleLabel ? (
                    <span className="badge-sale inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold">
                      {pkg.saleLabel}
                    </span>
                  ) : null}
                  <span
                    className={`${badgeClass[pkg.badge.kind]} inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold`}
                  >
                    {pkg.badge.crown ? (
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
                        <path d="M2 12h12l-1.2-7L9.5 8 8 3.5 6.5 8 3.2 5 2 12Zm1.5 1.5h9V15h-9v-1.5Z" />
                      </svg>
                    ) : null}
                    {pkg.badge.label}
                  </span>
                </div>
              </div>

              <div className="flex flex-1 flex-col px-3.5 pb-4 pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-slate">
                  <span className="inline-flex items-center gap-1 font-medium text-navy">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-warning" fill="currentColor" aria-hidden>
                      <path d="M8 1.2 9.7 5.8l4.9.4-3.7 3.2 1.1 4.8L8 11.8l-4 2.4 1.1-4.8-3.7-3.2 4.9-.4L8 1.2Z" />
                    </svg>
                    4.9
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1 truncate">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
                      <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5C3.5 9.5 8 14.5 8 14.5s4.5-5 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z" />
                    </svg>
                    {pkg.location}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
                      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.7 6.3V4.2H7.3v4.4l3.5 2.1.7-1.2-2.8-1.7Z" />
                    </svg>
                    {pkg.days}
                  </span>
                </div>

                <h3 className="mb-3 line-clamp-2 text-[17px] font-bold leading-snug text-navy">{pkg.title}</h3>

                <div className="mt-auto flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mb-1 block text-xs text-slate">Starting from</span>
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      {pkg.oldPrice ? (
                        <span className="text-sm text-slate line-through">{pkg.oldPrice}</span>
                      ) : null}
                      <strong className="text-[20px] font-semibold leading-none text-primary-strong">
                        {pkg.price}
                        <span className="ml-0.5 text-xs font-normal text-slate">/person</span>
                      </strong>
                    </div>
                  </div>

                  <a
                    href="/about"
                    className="btn-primary inline-flex shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
                  >
                    View tour
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>

        <Stagger className="hidden grid-cols-1 gap-6 md:grid md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <StaggerItem key={pkg.title}>
            <article
              className="overflow-hidden rounded-[10px] border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <div className="relative">
                <div className="relative h-[220px] overflow-hidden">
                  <Image
                    src={pkg.image}
                    alt={pkg.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover transition duration-500 hover:scale-105"
                  />
                </div>

                <button
                  type="button"
                  aria-label="Add to wishlist"
                  className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card text-navy shadow transition hover:bg-primary-strong hover:text-white"
                >
                  <svg viewBox="0 0 18 18" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                    <path d="M15.8 3.3A4.4 4.4 0 0 0 9 3.3L9 3.9 8.4 3.3a4.4 4.4 0 1 0-6.2 6.2L9 16l6.8-6.5a4.4 4.4 0 0 0 0-6.2Z" />
                  </svg>
                </button>

                <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
                  {pkg.saleLabel ? (
                    <span className="badge-sale rounded-full px-3 py-1.5 text-[13px] font-medium">
                      {pkg.saleLabel}
                    </span>
                  ) : null}
                  <span
                    className={`${badgeClass[pkg.badge.kind]} rounded-full px-3 py-1.5 text-[13px] font-medium`}
                  >
                    {pkg.badge.crown ? (
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                        <path d="M2 12h12l-1.2-7L9.5 8 8 3.5 6.5 8 3.2 5 2 12Zm1.5 1.5h9V15h-9v-1.5Z" />
                      </svg>
                    ) : null}
                    {pkg.badge.label}
                  </span>
                </div>

                {pkg.play ? (
                  <span className="absolute bottom-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white backdrop-blur">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                      <path d="M4 2.5v11l9-5.5-9-5.5Z" />
                    </svg>
                  </span>
                ) : null}

                {pkg.dots ? (
                  <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-card" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                  </div>
                ) : null}
              </div>

              <div className="relative px-5 pb-8 pt-5 sm:px-6">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[15px] text-slate">
                    <svg
                      viewBox="0 0 16 16"
                      className="h-4 w-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5C3.5 9.5 8 14.5 8 14.5s4.5-5 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z" />
                    </svg>
                    {pkg.location}
                  </span>
                  <span className="rounded-full border border-primary/30 bg-primary-tint px-2.5 py-1 text-xs font-semibold text-primary-strong">
                    {pkg.days}
                  </span>
                </div>

                <h3 className="mb-2 text-lg font-semibold leading-snug text-navy">
                  <a href="/about" className="transition hover:text-primary-strong">
                    {pkg.title}
                  </a>
                </h3>

                <p className="mb-5 truncate text-sm text-slate">{pkg.route}</p>

                <div className="flex items-end justify-between gap-3">
                  <div>
                    <span className="mb-2 block text-sm text-slate">Starting From</span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      {pkg.oldPrice ? (
                        <span className="text-base text-slate line-through">
                          {pkg.oldPrice}
                        </span>
                      ) : null}
                      <strong className="text-[25px] font-semibold leading-none text-primary-strong">
                        {pkg.price}
                        <span className="ml-1 text-sm font-normal text-slate">
                          /per person
                        </span>
                      </strong>
                    </div>
                  </div>

                  {pkg.action === "view" ? (
                    <a
                      href="/about"
                      className="btn-primary inline-flex shrink-0 rounded-lg px-4 py-3 text-[15px]"
                    >
                      View Tour
                    </a>
                  ) : (
                    <a
                      href="/about"
                      aria-label={`View ${pkg.title}`}
                      className="btn-primary inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5s-1.2 5.9-3.6 8.5M12 3.5C9.6 6.1 8.4 8.9 8.4 12s1.2 5.9 3.6 8.5" strokeLinecap="round" />
                      </svg>
                    </a>
                  )}
                </div>

                <span className="badge-success absolute bottom-0 left-0 inline-flex items-center px-3 py-1.5 text-xs [clip-path:polygon(0_0,100%_0,92%_100%,0_100%)]">
                  Hotel+Flight Included
                </span>
              </div>
            </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
