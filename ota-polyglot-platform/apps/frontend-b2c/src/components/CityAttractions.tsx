import Image from "next/image";
import Link from "next/link";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";

type Attraction = {
  image: string;
  title: string;
  location: string;
  duration: string;
  rating: string;
  price: string;
  oldPrice?: string;
  badges?: { label: string; kind: "sale" | "featured" | "best"; crown?: boolean }[];
  wishlist?: boolean;
  dots?: boolean;
};

const attractions: Attraction[] = [
  {
    image: "/images/offers/hiker.jpg",
    title: "City Lights & Nightlife Experience",
    location: "United Arab Emirates",
    duration: "2 Hours",
    rating: "4.9",
    price: "$89",
    oldPrice: "$79",
    wishlist: true,
    badges: [
      { label: "Up to 15% off", kind: "sale" },
      { label: "Best seller", kind: "best", crown: true },
    ],
  },
  {
    image: "/images/offers/desert.jpg",
    title: "Sunset Camel Ride in the Desert",
    location: "Egypt",
    duration: "01 Days",
    rating: "4.9",
    price: "$119",
    dots: true,
    badges: [
      { label: "Sale on!", kind: "sale" },
      { label: "Featured", kind: "featured" },
    ],
  },
  {
    image: "/images/packages/thailand.jpg",
    title: "Refreshment Escape",
    location: "Thailand",
    duration: "5 Hours",
    rating: "4.9",
    price: "$49",
    wishlist: true,
  },
];

const badgeClass = {
  sale: "badge-sale",
  featured: "badge-featured",
  best: "badge-featured",
} as const;

function Stars() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 16 16" className="h-3.5 w-3.5 text-warning" fill="currentColor">
          <path d="M8 1.2 9.7 5.8l4.9.4-3.7 3.2 1.1 4.8L8 11.8l-4 2.4 1.1-4.8-3.7-3.2 4.9-.4L8 1.2Z" />
        </svg>
      ))}
    </span>
  );
}

export default function CityAttractions() {
  return (
    <section className="overflow-x-hidden bg-card px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto w-full max-w-[1320px]">
        <Reveal className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
          <h2 className="text-3xl font-bold tracking-tight text-navy max-md:text-[26px] sm:text-4xl">
            City Attractions
          </h2>
          <Link
            href="/about"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-strong transition hover:text-primary-hover"
          >
            <span className="md:hidden">View all</span>
            <span className="hidden md:inline">View All Package</span>
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </Reveal>

        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          {attractions.map((item) => (
            <article
              key={`mobile-${item.title}`}
              className="flex w-[82%] shrink-0 snap-start flex-col overflow-hidden rounded-[16px] border border-border bg-card shadow-sm"
            >
              <div className="relative h-[188px] shrink-0 overflow-hidden">
                <Image
                  src={item.image}
                  alt={item.title}
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

                {item.badges?.length ? (
                  <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
                    {item.badges.map((badge) => (
                      <span
                        key={badge.label}
                        className={`${badgeClass[badge.kind]} inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold`}
                      >
                        {badge.crown ? (
                          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
                            <path d="M2 12h12l-1.2-7L9.5 8 8 3.5 6.5 8 3.2 5 2 12Zm1.5 1.5h9V15h-9v-1.5Z" />
                          </svg>
                        ) : null}
                        {badge.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col px-3.5 pb-4 pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-slate">
                  <span className="inline-flex items-center gap-1 font-medium text-navy">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-warning" fill="currentColor" aria-hidden>
                      <path d="M8 1.2 9.7 5.8l4.9.4-3.7 3.2 1.1 4.8L8 11.8l-4 2.4 1.1-4.8-3.7-3.2 4.9-.4L8 1.2Z" />
                    </svg>
                    {item.rating}
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1 truncate">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
                      <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5C3.5 9.5 8 14.5 8 14.5s4.5-5 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z" />
                    </svg>
                    {item.location}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="currentColor" aria-hidden>
                      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.7 6.3V4.2H7.3v4.4l3.5 2.1.7-1.2-2.8-1.7Z" />
                    </svg>
                    {item.duration}
                  </span>
                </div>

                <h3 className="mb-3 line-clamp-2 text-[17px] font-bold leading-snug text-navy">
                  {item.title}
                </h3>

                <div className="mt-auto flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mb-1 block text-xs text-slate">Starting from</span>
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      {item.oldPrice ? (
                        <span className="text-sm text-slate line-through">{item.oldPrice}</span>
                      ) : null}
                      <strong className="text-[20px] font-semibold leading-none text-primary-strong">
                        {item.price}
                        <span className="ml-0.5 text-xs font-normal text-slate">/person</span>
                      </strong>
                    </div>
                  </div>

                  <Link
                    href="/about"
                    className="btn-primary inline-flex shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
                  >
                    View tour
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        <Stagger className="hidden grid-cols-1 items-stretch gap-6 md:grid md:grid-cols-2 xl:grid-cols-3">
          {attractions.map((item) => (
            <StaggerItem key={item.title} className="h-full min-w-0">
              <article className="flex h-full flex-col overflow-hidden rounded-[12px] border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
                <div className="relative h-[220px] shrink-0 overflow-hidden sm:h-[240px]">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover transition duration-500 hover:scale-105"
                  />

                  {item.wishlist ? (
                    <button
                      type="button"
                      aria-label="Add to wishlist"
                      className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-card text-navy shadow transition hover:bg-primary-strong hover:text-white"
                    >
                      <svg viewBox="0 0 18 18" className="h-4 w-4" fill="currentColor" aria-hidden>
                        <path d="M15.8 3.3A4.4 4.4 0 0 0 9 3.3L9 3.9 8.4 3.3a4.4 4.4 0 1 0-6.2 6.2L9 16l6.8-6.5a4.4 4.4 0 0 0 0-6.2Z" />
                      </svg>
                    </button>
                  ) : null}

                  {item.badges?.length ? (
                    <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
                      {item.badges.map((badge) => (
                        <span
                          key={badge.label}
                          className={`${badgeClass[badge.kind]} inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium`}
                        >
                          {badge.crown ? (
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                              <path d="M2 12h12l-1.2-7L9.5 8 8 3.5 6.5 8 3.2 5 2 12Zm1.5 1.5h9V15h-9v-1.5Z" />
                            </svg>
                          ) : null}
                          {badge.label}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {item.dots ? (
                    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-card" />
                      <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                      <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Stars />
                    <span className="text-sm font-medium text-slate">({item.rating})</span>
                  </div>

                  <h3 className="mb-3 line-clamp-2 text-lg font-bold leading-snug text-navy sm:text-xl">
                    {item.title}
                  </h3>

                  <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-slate">
                    <span className="inline-flex items-center gap-1.5">
                      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
                        <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5C3.5 9.5 8 14.5 8 14.5s4.5-5 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z" />
                      </svg>
                      {item.location}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
                        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm.7 6.3V4.2H7.3v4.4l3.5 2.1.7-1.2-2.8-1.7Z" />
                      </svg>
                      {item.duration}
                    </span>
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-3">
                    <div>
                      <span className="mb-1.5 block text-sm text-slate">Starting From</span>
                      <div className="flex flex-wrap items-baseline gap-2">
                        {item.oldPrice ? (
                          <span className="text-base text-slate line-through">{item.oldPrice}</span>
                        ) : null}
                        <strong className="text-[22px] font-semibold leading-none text-primary-strong sm:text-[25px]">
                          {item.price}
                          <span className="ml-1 text-sm font-normal text-slate">/per person</span>
                        </strong>
                      </div>
                    </div>

                    <Link
                      href="/about"
                      className="btn-primary inline-flex shrink-0 rounded-lg px-4 py-3 text-[15px]"
                    >
                      View Tour
                    </Link>
                  </div>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
