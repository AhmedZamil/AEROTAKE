"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "./icons";

const banners = [
  {
    id: "air-asia",
    image: "/images/plane_wide.png",
    imageAlt: "Air Asia aircraft in flight",
    imageSide: "right" as const,
  },
  {
    id: "qatar",
    image: "/images/plane.png",
    imageAlt: "Qatar Airways flight above the clouds",
    imageSide: "left" as const,
  },
  {
    id: "explore",
    image: "/images/plane_wide.png",
    imageAlt: "Explore destinations around the world",
    imageSide: "right" as const,
  },
];

export default function PromoBannerSlider() {
  const [active, setActive] = useState(0);
  const count = banners.length;

  function prev() {
    setActive((value) => (value + count - 1) % count);
  }

  function next() {
    setActive((value) => (value + 1) % count);
  }

  const order = [0, 1, 2].map((offset) => (offset + active) % count);

  return (
    <section className="relative">
      <button
        type="button"
        aria-label="Previous banner"
        onClick={prev}
        className="absolute top-1/2 left-0 z-10 hidden h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-aerotake-navy shadow-md hover:bg-aerotake-canvas xl:flex"
      >
        <ChevronLeftIcon />
      </button>
      <button
        type="button"
        aria-label="Next banner"
        onClick={next}
        className="absolute top-1/2 right-0 z-10 hidden h-9 w-9 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-aerotake-navy shadow-md hover:bg-aerotake-canvas xl:flex"
      >
        <ChevronRightIcon />
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {order.map((id) => (
          <BannerCard key={banners[id].id} id={id} />
        ))}
      </div>

      <div className="mt-4 flex justify-center gap-2">
        {banners.map((banner, index) => (
          <button
            key={banner.id}
            type="button"
            aria-label={`Go to banner ${index + 1}`}
            onClick={() => setActive(index)}
            className={
              active === index
                ? "h-1.5 w-6 rounded-full bg-aerotake-coral"
                : "h-1.5 w-1.5 rounded-full bg-[#d1d5db]"
            }
          />
        ))}
      </div>
    </section>
  );
}

function BannerCard({ id }: { id: number }) {
  if (id === 0) {
    return (
      <article className="relative min-h-[188px] overflow-hidden rounded-2xl bg-[#dff3fb]">
        <BannerImage src="/images/plane_wide.png" alt="Air Asia aircraft" side="right" />
        <div className="relative z-10 max-w-[210px] p-5">
          <p className="text-[18px] leading-6 font-bold text-[#0b3b5a]">
            Fly smart with Air Asia
          </p>
          <ul className="mt-3 space-y-1.5 text-[12px] text-[#24597a]">
            {["Best prices guaranteed", "Extra baggage options", "Easy online booking"].map(
              (item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <span className="text-aerotake-coral">
                    <CheckIcon />
                  </span>
                  {item}
                </li>
              ),
            )}
          </ul>
          <button
            type="button"
            className="mt-4 rounded-lg bg-aerotake-coral px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-aerotake-coral-dark"
          >
            Book Now
          </button>
        </div>
      </article>
    );
  }

  if (id === 1) {
    return (
      <article className="relative min-h-[188px] overflow-hidden rounded-2xl bg-[#f6efe4]">
        <BannerImage src="/images/plane.png" alt="Qatar Airways flight" side="left" />
        <div className="relative z-10 ml-auto max-w-[210px] p-5 text-right">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-aerotake-coral">
            10% DISCOUNT
          </p>
          <p className="mt-1 text-[18px] leading-6 font-bold text-[#5c0632]">
            WITH QATAR AIRWAYS
          </p>
          <p className="mt-2 text-[12px] text-[#6b4a3a]">
            On all international flights. Valid until 31 Dec 2026.
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-aerotake-coral px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-aerotake-coral-dark"
          >
            Book Now
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="relative min-h-[188px] overflow-hidden rounded-2xl bg-[#10203c] text-white">
      <BannerImage src="/images/plane_wide.png" alt="Explore the world" side="right" dark />
      <div className="relative z-10 max-w-[230px] p-5">
        <p className="text-[18px] leading-6 font-bold">
          EXPLORE THE WORLD WITH AEROTAKE
        </p>
        <p className="mt-2 text-[12px] text-white/70">
          Discover exclusive fares to 1000+ destinations.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            ["🇺🇸", "JFK"],
            ["🇦🇪", "DXB"],
            ["🇬🇧", "LHR"],
            ["🇸🇬", "SIN"],
            ["🇹🇭", "BKK"],
          ].map(([flag, code]) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px]"
            >
              <span>{flag}</span>
              {code}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg bg-aerotake-coral px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-aerotake-coral-dark"
        >
          View All Destinations
        </button>
      </div>
    </article>
  );
}

function BannerImage({
  src,
  alt,
  side,
  dark = false,
}: {
  src: string;
  alt: string;
  side: "left" | "right";
  dark?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 w-[58%] ${
        side === "right" ? "right-0" : "left-0"
      }`}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 80vw, 28vw"
        className={`object-cover ${side === "right" ? "object-left" : "object-[70%_40%]"} ${
          dark ? "opacity-50" : "opacity-90"
        }`}
      />
      <div
        className={`absolute inset-0 ${
          side === "right"
            ? dark
              ? "bg-gradient-to-r from-[#10203c] via-[#10203c]/70 to-transparent"
              : "bg-gradient-to-r from-[#dff3fb] via-[#dff3fb]/70 to-transparent"
            : "bg-gradient-to-l from-[#f6efe4] via-[#f6efe4]/75 to-transparent"
        }`}
      />
    </div>
  );
}
