import Image from "next/image";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";

const tips = [
  {
    location: "Maldives Beach",
    image: "/images/tips/maldives.jpg",
    title: "Best Time to Visit the Maldives for a Perfect Beach Escape.",
    excerpt:
      "The Maldives is a dream destination known for its crystal-clear lagoons and luxury overwater villas.",
  },
  {
    location: "South Africa",
    image: "/images/tips/safari.jpg",
    title: "What to Expect on Your First Wildlife Adventure Africa Safari.",
    excerpt:
      "An African safari is one of the most exciting travel experiences in the world. Visitors can witness the Big Five wildlife.",
  },
  {
    location: "Switzerland",
    image: "/images/tips/switzerland.jpg",
    title: "Top Places to Visit in Switzerland for Nature Lovers.",
    excerpt:
      "Switzerland is famous for its snow-capped Alps, charming villages, and scenic train journeys.",
  },
];

function ReadMoreArrow() {
  return (
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
  );
}

export default function TravelTips() {
  return (
    <section className="bg-card px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto max-w-[1320px]">
        <Reveal className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between max-md:mb-6 max-md:flex-row max-md:items-end max-md:justify-between max-md:gap-3">
          <div>
            <p className="mb-2 hidden text-sm font-semibold text-primary-strong md:block sm:text-[15px]">
              Get to know more with Aerotake
            </p>
            <h2 className="text-3xl font-bold tracking-tight text-navy max-md:text-[22px] max-md:leading-tight sm:text-4xl">
              <span className="md:hidden">Travel Tips &amp; Inspiration</span>
              <span className="hidden md:inline">Travel Tips &amp; Inspirations.</span>
            </h2>
          </div>
          <a
            href="#inspiration"
            className="hidden shrink-0 items-center justify-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-navy transition hover:border-primary-strong hover:text-primary-strong md:inline-flex"
          >
            View All Inspiration
          </a>
          <a
            href="#inspiration"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-strong transition hover:text-primary-hover md:hidden"
          >
            View all
            <ReadMoreArrow />
          </a>
        </Reveal>

        <div className="flex flex-col gap-6 md:hidden">
          {tips.map((tip) => (
            <article key={`mobile-${tip.title}`} className="flex items-start gap-3.5">
              <div className="relative h-[96px] w-[96px] shrink-0 overflow-hidden rounded-[18px]">
                <Image
                  src={tip.image}
                  alt={tip.location}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 text-[13px] font-semibold text-primary-strong">{tip.location}</p>
                <h3 className="mb-1 line-clamp-2 text-[15px] font-bold leading-snug text-navy">
                  <a href="/faq" className="transition hover:text-primary-strong">
                    {tip.title}
                  </a>
                </h3>
                <p className="mb-1.5 line-clamp-2 text-[13px] leading-relaxed text-slate">{tip.excerpt}</p>
                <a
                  href="/faq"
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-strong transition hover:text-primary-hover"
                >
                  Read more
                  <ReadMoreArrow />
                </a>
              </div>
            </article>
          ))}
        </div>

        <Stagger className="hidden grid-cols-1 items-stretch gap-6 md:grid md:grid-cols-2 xl:grid-cols-3">
          {tips.map((tip) => (
            <StaggerItem key={tip.title} className="h-full min-w-0">
              <article className="flex h-full flex-col overflow-hidden rounded-[16px] border border-border bg-card transition duration-300 hover:-translate-y-1 hover:shadow-md">
                <div className="relative h-[220px] shrink-0 sm:h-[240px]">
                  <Image
                    src={tip.image}
                    alt={tip.location}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover"
                  />
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-navy shadow-sm">
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 text-navy"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5C3.5 9.5 8 14.5 8 14.5s4.5-5 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2A1.7 1.7 0 1 1 8 4.3a1.7 1.7 0 0 1 0 3.4Z" />
                    </svg>
                    {tip.location}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <h3 className="mb-3 line-clamp-2 text-lg font-bold leading-snug text-navy sm:text-xl">
                    <a href="/faq" className="transition hover:text-primary-strong">
                      {tip.title}
                    </a>
                  </h3>
                  <p className="mb-5 line-clamp-3 flex-1 text-[15px] leading-relaxed text-slate">
                    {tip.excerpt}
                  </p>
                  <a
                    href="/faq"
                    className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-navy transition hover:text-primary-strong"
                  >
                    Read More
                    <svg
                      viewBox="0 0 16 16"
                      className="h-3.5 w-3.5 text-slate"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 8h10M9 4l4 4-4 4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
