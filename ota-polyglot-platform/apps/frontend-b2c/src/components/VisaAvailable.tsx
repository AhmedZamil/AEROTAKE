import Image from "next/image";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";

const visas = [
  {
    country: "Egypt",
    image: "/images/visa/egypt.jpg",
    badge: "High Success Rate",
    tags: ["Tourist Visa", "Business Visa", "+12 More"],
    flag: "egypt",
  },
  {
    country: "United Kingdom",
    image: "/images/visa/uk.jpg",
    badge: "Urgent Processing",
    tags: ["Tourist Visa", "Student Visa", "+9 More"],
    flag: "uk",
  },
  {
    country: "Vietnam",
    image: "/images/visa/vietnam.jpg",
    badge: "Fast Delivery",
    tags: ["Business Visa", "Tourist Visa", "+7 More"],
    flag: "vietnam",
  },
] as const;

function Flag({ code }: { code: (typeof visas)[number]["flag"] }) {
  if (code === "egypt") {
    return (
      <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
        <rect width="24" height="8" y="0" fill="#ce1126" />
        <rect width="24" height="8" y="8" fill="#fff" />
        <rect width="24" height="8" y="16" fill="#000" />
        <circle cx="12" cy="12" r="2.2" fill="#c09300" />
      </svg>
    );
  }
  if (code === "uk") {
    return (
      <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
        <rect width="24" height="24" fill="#012169" />
        <path d="M0 0 24 24M24 0 0 24" stroke="#fff" strokeWidth="4" />
        <path d="M0 0 24 24M24 0 0 24" stroke="#c8102e" strokeWidth="2" />
        <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="6" />
        <path d="M12 0v24M0 12h24" stroke="#c8102e" strokeWidth="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <rect width="24" height="24" fill="#da251d" />
      <path
        d="M12 6.5 13.2 10.2H17l-3 2.2 1.1 3.6L12 13.8 8.9 16l1.1-3.6-3-2.2h3.8L12 6.5Z"
        fill="#ff0"
      />
    </svg>
  );
}

export default function VisaAvailable() {
  return (
    <section id="visa" className="overflow-x-hidden bg-card px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-[1320px]">
        <Reveal className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between max-md:mb-6 max-md:flex-row max-md:items-end max-md:justify-between max-md:gap-3">
          <div className="max-w-xl">
            <h2 className="mb-2 text-3xl font-bold tracking-tight text-navy max-md:mb-0 max-md:text-[26px] sm:text-4xl">
              Visa Available
            </h2>
            <p className="hidden text-[15px] leading-relaxed text-slate md:block sm:text-base">
              We help you prepare documents, avoid common mistakes, and ensure a
              smooth approval process.
            </p>
          </div>
          <a
            href="#visa"
            className="hidden shrink-0 items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-navy transition hover:border-primary-strong hover:text-primary-strong md:inline-flex"
          >
            View All Visa
          </a>
          <a
            href="#visa"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-strong transition hover:text-primary-hover md:hidden"
          >
            View all
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
          </a>
        </Reveal>

        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          {visas.map((visa) => (
            <article
              key={`mobile-${visa.country}`}
              className="flex w-[82%] shrink-0 snap-start flex-col overflow-hidden rounded-[16px] border border-border bg-card shadow-sm"
            >
              <div className="relative h-[188px] shrink-0 overflow-hidden">
                <Image src={visa.image} alt={visa.country} fill sizes="82vw" className="object-cover" />
                <span className="badge-neutral absolute right-3 top-3 z-10 rounded-full px-2.5 py-1 text-[11px] font-semibold">
                  {visa.badge}
                </span>
              </div>

              <div className="flex flex-1 flex-col px-3.5 pb-4 pt-3">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="relative h-8 w-8 overflow-hidden rounded-full ring-2 ring-border">
                    <Flag code={visa.flag} />
                  </span>
                  <h3 className="text-[17px] font-bold leading-snug text-navy">{visa.country}</h3>
                </div>

                <div className="mb-3 flex flex-wrap gap-1.5">
                  {visa.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary-tint px-2.5 py-1 text-[11px] font-medium text-primary-strong"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <a
                  href="#visa"
                  className="btn-primary mt-auto inline-flex w-fit shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
                >
                  View visa
                </a>
              </div>
            </article>
          ))}
        </div>

        <Stagger className="hidden grid-cols-1 gap-5 md:grid md:grid-cols-2 xl:grid-cols-3">
          {visas.map((visa) => (
            <StaggerItem key={visa.country}>
            <article
              className="group relative h-[380px] overflow-hidden rounded-[18px] sm:h-[420px]"
            >
              <Image
                src={visa.image}
                alt={visa.country}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                className="object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/45 via-transparent to-transparent" />

              <span className="absolute right-4 top-4 z-10 badge-neutral rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm">
                {visa.badge}
              </span>

              <div className="absolute inset-x-4 bottom-4 z-10 rounded-2xl bg-card p-4 shadow-lg sm:inset-x-5 sm:bottom-5 sm:p-5">
                <div className="mb-3 flex items-center gap-3">
                  <span className="relative h-10 w-10 overflow-hidden rounded-full ring-2 ring-border">
                    <Flag code={visa.flag} />
                  </span>
                  <h3 className="text-lg font-bold text-navy sm:text-xl">
                    {visa.country}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {visa.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-primary-tint px-3 py-1.5 text-xs font-medium text-primary-strong sm:text-[13px]"
                    >
                      {tag}
                    </span>
                  ))}
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
