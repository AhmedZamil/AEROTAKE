"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";

type Continent =
  | "asia"
  | "europe"
  | "australia"
  | "africa"
  | "north-america";

type Destination = {
  name: string;
  tours: string;
  image: string;
  continent: Continent;
};

const continents: { id: Continent; label: string }[] = [
  { id: "asia", label: "Asia" },
  { id: "europe", label: "Europe" },
  { id: "australia", label: "Australia" },
  { id: "africa", label: "Africa" },
  { id: "north-america", label: "North America" },
];

const destinations: Destination[] = [
  {
    name: "Japan",
    tours: "04 tours",
    image: "/images/destinations/japan.jpg",
    continent: "asia",
  },
  {
    name: "Thailand",
    tours: "07 tours",
    image: "/images/destinations/thailand.jpg",
    continent: "asia",
  },
  {
    name: "Vietnam",
    tours: "05 tours",
    image: "/images/destinations/vietnam.jpg",
    continent: "asia",
  },
  {
    name: "Indonesia",
    tours: "06 tours",
    image: "/images/destinations/indonesia.jpg",
    continent: "asia",
  },
  {
    name: "Singapore",
    tours: "08 tours",
    image: "/images/destinations/singapore.jpg",
    continent: "asia",
  },
  {
    name: "France",
    tours: "08 tours",
    image: "/images/destinations/france.jpg",
    continent: "europe",
  },
  {
    name: "Italy",
    tours: "08 tours",
    image: "/images/destinations/italy.jpg",
    continent: "europe",
  },
  {
    name: "Australia",
    tours: "04 tours",
    image: "/images/destinations/australia.jpg",
    continent: "australia",
  },
  {
    name: "Egypt",
    tours: "06 tours",
    image: "/images/destinations/egypt.jpg",
    continent: "africa",
  },
  {
    name: "USA",
    tours: "08 tours",
    image: "/images/destinations/usa.jpg",
    continent: "north-america",
  },
];

export default function PopularDestinations() {
  const [continent, setContinent] = useState<Continent>("asia");
  const [active, setActive] = useState(2);

  const items = useMemo(
    () => destinations.filter((d) => d.continent === continent),
    [continent],
  );

  const safeActive = Math.min(active, Math.max(items.length - 1, 0));

  const go = (dir: -1 | 1) => {
    if (!items.length) return;
    setActive((prev) => {
      const next = prev + dir;
      if (next < 0) return items.length - 1;
      if (next >= items.length) return 0;
      return next;
    });
  };

  useEffect(() => {
    if (items.length < 2) return;
    const id = window.setInterval(() => {
      setActive((prev) => {
        const next = prev + 1;
        return next >= items.length ? 0 : next;
      });
    }, 3200);
    return () => window.clearInterval(id);
  }, [items.length, continent]);

  return (
    <section
      id="destinations"
      className="relative overflow-hidden pt-[70px] md:pt-20 xl:pt-[90px]"
      style={{
        background:
          "linear-gradient(180deg, var(--primary-tint) 0%, var(--primary-tint) 72%, var(--card) 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='500' viewBox='0 0 500 500'%3E%3Cg fill='none' stroke='%23FD573C' stroke-width='1.2' opacity='0.25'%3E%3Cpath d='M30 100c50 15 90-25 150-12s100 50 170 25 100-15 140 25'/%3E%3Cpath d='M20 200c60-25 110 15 170 0s110-40 180-12 90 40 130 15'/%3E%3Cpath d='M40 300c50 25 110-15 170 12s120 25 180-12 80-25 120 12'/%3E%3Cpath d='M10 400c70-12 120 25 190 12s130-50 200-25 70 25 100 40'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundSize: "520px 520px",
          maskImage:
            "linear-gradient(180deg, #000 0%, #000 65%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, #000 0%, #000 65%, transparent 100%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[1820px] px-3 pb-16 md:pb-20">
        <Reveal className="mb-12 text-center md:mb-[60px]">
          <h2 className="mb-8 text-3xl font-bold tracking-tight text-navy sm:text-4xl xl:text-[42px]">
            Most Popular Destination
          </h2>

          <ul className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-5">
            {continents.map((tab) => {
              const isActive = continent === tab.id;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setContinent(tab.id);
                      const count = destinations.filter(
                        (d) => d.continent === tab.id,
                      ).length;
                      setActive(Math.min(2, Math.max(count - 1, 0)));
                    }}
                    className={`inline-flex items-center rounded-full px-4 py-2 text-[15px] font-medium transition sm:px-[21px] sm:py-2.5 sm:text-lg ${
                      isActive
                        ? "bg-primary-strong text-white"
                        : "bg-card text-navy hover:bg-primary-strong hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </Reveal>

        <div
          className="relative mx-auto h-[520px] w-full overflow-visible sm:h-[560px] xl:h-[580px]"
          style={{ perspective: "1200px", transformStyle: "preserve-3d" }}
        >
          {items.map((item, index) => {
            const n = items.length;
            let offset = ((index - safeActive) % n + n) % n;
            if (offset >= n / 2) offset -= n;

            const abs = Math.abs(offset);
            if (abs > 2) return null;

            const rotate = offset * -40.8;
            const translateX = offset * 440;
            const translateZ = abs === 0 ? 0 : abs === 1 ? -107 : -215;
            const opacity = abs === 0 ? 1 : abs === 1 ? 0.98 : 0.85;

            return (
              <button
                key={`${continent}-${item.name}`}
                type="button"
                onClick={() => setActive(index)}
                className="absolute left-1/2 top-0 w-[285px] text-left transition-all duration-500 ease-out sm:w-[360px] xl:w-[410px]"
                style={{
                  transform: `translateX(calc(-50% + ${translateX}px)) translateZ(${translateZ}px) rotateY(${rotate}deg)`,
                  transformStyle: "preserve-3d",
                  zIndex: 10 - abs,
                  opacity,
                }}
              >
                <div className="relative block overflow-hidden rounded-[10px]">
                  <div
                    className={`relative w-full transition-all duration-500 ${
                      abs === 0
                        ? "h-[360px] sm:h-[445px] xl:h-[450px]"
                        : "h-[360px] sm:h-[445px]"
                    }`}
                  >
                    <Image
                      src={item.image}
                      alt={item.name}
                      fill
                      sizes="410px"
                      className="object-cover"
                    />
                  </div>
                  <span className="absolute left-5 top-4 rounded-full bg-card px-3 py-1.5 text-base font-medium text-primary-strong">
                    {item.tours}
                  </span>
                </div>
                <h3 className="mt-4 text-center text-[22px] font-semibold text-navy sm:text-[25px]">
                  {item.name}
                </h3>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-center gap-8 xl:gap-10">
          <button
            type="button"
            aria-label="Previous destination"
            onClick={() => go(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-slate shadow transition hover:bg-primary-strong hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <path d="M4.11 7.45 10.34 1.22A1.1 1.1 0 0 1 11.88 1.22l.46.46a1.1 1.1 0 0 1 0 1.54L6.65 8l5.24 5.24a1.1 1.1 0 0 1 0 1.54l-.46.46a1.1 1.1 0 0 1-1.54 0L4.11 8.54a1.1 1.1 0 0 1 0-1.09Z" />
            </svg>
          </button>

          <div className="flex items-center gap-2.5">
            {items.map((item, index) => (
              <button
                key={item.name}
                type="button"
                aria-label={`Go to ${item.name}`}
                onClick={() => setActive(index)}
                className={`h-2.5 w-2.5 rounded-full transition ${
                  index === safeActive
                    ? "bg-primary-strong"
                    : "border border-border bg-card"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label="Next destination"
            onClick={() => go(1)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-slate shadow transition hover:bg-primary-strong hover:text-white"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
              <path d="M11.78 7.45 5.72 1.22A1.1 1.1 0 0 0 4.22 1.22l-.45.46a1.1 1.1 0 0 0 0 1.54L9.31 8l-5.1 5.24a1.1 1.1 0 0 0 0 1.54l.45.46a1.1 1.1 0 0 0 1.5 0l6.07-6.24a1.1 1.1 0 0 0 0-1.09Z" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
