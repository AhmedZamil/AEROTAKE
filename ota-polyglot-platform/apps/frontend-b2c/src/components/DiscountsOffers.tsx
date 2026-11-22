"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { Autoplay } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import { Reveal } from "@/components/motion/Reveal";

const offers = [
  {
    src: "/images/offers/offer-card-img1.jpg",
    alt: "Vietnam early bird travel discount",
    hoverTitle: "Vietnam Early Bird!",
    hoverBody:
      "Save up to 20% on Vietnam packages—tropical islands, city tours, and curated escapes for early bookers.",
  },
  {
    src: "/images/offers/offer-card-img3.jpg",
    alt: "Travel around the world offer",
    hoverTitle: "Travel Around the World!",
    hoverBody:
      "Multi-destination adventures with 25% off selected routes. Perfect for explorers ready for the next chapter.",
  },
  {
    src: "/images/offers/adventure.png",
    alt: "Adventure awaits hiking offer",
    hoverTitle: "Adventure Awaits!",
    hoverBody:
      "Mountain treks and scenic coastal trails from $199. Gear up for breath-taking outdoor journeys.",
  },
  {
    src: "/images/offers/travelmiddle_east.png",
    alt: "Middle East Ramadan travel sale",
    hoverTitle: "Middle East Sale!",
    hoverBody:
      "Up to 20% off Ramadan travel deals across the Middle East—desert escapes and cultural tours included.",
  },
  {
    src: "/images/offers/hajj.png",
    alt: "Hajj and Umrah travel package",
    hoverTitle: "Hajj & Umrah Travel!",
    hoverBody:
      "10-day all-inclusive packages from $1099. Trusted guidance for your sacred journey.",
  },
];

// Enough slides for loop at 4-per-view
const slides = [...offers, ...offers];

const flightsHref =
  "/flights?from=DAC&to=DXB&depart=2026-10-05&adults=1&children=0&infants=0&cabin=economy&trip=oneway";

export default function DiscountsOffers() {
  const swiperRef = useRef<SwiperType | null>(null);

  return (
    <section className="overflow-x-hidden bg-card px-4 pb-6 pt-10 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px]">
        <Reveal>
          <h2 className="mb-8 text-center text-3xl font-bold tracking-tight text-navy sm:text-4xl">
            Discounts &amp; Offers
          </h2>
        </Reveal>

        <Reveal delay={0.08} className="relative w-full overflow-hidden">
          <button
            type="button"
            aria-label="Previous offers"
            onClick={() => swiperRef.current?.slidePrev()}
            className="absolute top-1/2 left-2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card text-navy shadow-md transition hover:bg-primary-strong hover:text-white lg:flex"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M4.11 7.45 10.34 1.22A1.1 1.1 0 0 1 11.88 1.22l.46.46a1.1 1.1 0 0 1 0 1.54L6.65 8l5.24 5.24a1.1 1.1 0 0 1 0 1.54l-.46.46a1.1 1.1 0 0 1-1.54 0L4.11 8.54a1.1 1.1 0 0 1 0-1.09Z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next offers"
            onClick={() => swiperRef.current?.slideNext()}
            className="absolute top-1/2 right-2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card text-navy shadow-md transition hover:bg-primary-strong hover:text-white lg:flex"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M11.78 7.45 5.72 1.22A1.1 1.1 0 0 0 4.22 1.22l-.45.46a1.1 1.1 0 0 0 0 1.54L9.31 8l-5.1 5.24a1.1 1.1 0 0 0 0 1.54l.45.46a1.1 1.1 0 0 0 1.5 0l6.07-6.24a1.1 1.1 0 0 0 0-1.09Z" />
            </svg>
          </button>

          <Swiper
            modules={[Autoplay]}
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
            }}
            loop
            spaceBetween={20}
            slidesPerView={1.15}
            speed={700}
            autoplay={{
              delay: 3200,
              disableOnInteraction: false,
              pauseOnMouseEnter: true,
            }}
            breakpoints={{
              640: { slidesPerView: 2, spaceBetween: 18 },
              1024: { slidesPerView: 3, spaceBetween: 20 },
              1280: { slidesPerView: 4, spaceBetween: 22 },
            }}
            className="overflow-hidden"
          >
            {slides.map((offer, index) => (
              <SwiperSlide key={`${offer.src}-${index}`} className="!h-auto">
                <article className="group relative aspect-[3/4] overflow-hidden rounded-[22px] bg-border shadow-md">
                  <Image
                    src={offer.src}
                    alt={offer.alt}
                    fill
                    sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 25vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />

                  <div className="absolute inset-0 z-20 flex translate-y-3 flex-col justify-between bg-primary-strong p-6 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:p-7">
                    <div>
                      <h3 className="mb-3 text-2xl font-bold leading-snug text-white sm:text-[28px]">
                        {offer.hoverTitle}
                      </h3>
                      <p className="max-w-[95%] text-[15px] leading-relaxed text-white/90">
                        {offer.hoverBody}
                      </p>
                    </div>
                    <Link
                      href={flightsHref}
                      className="inline-flex min-h-11 w-fit items-center rounded-full bg-card px-5 py-2.5 text-sm font-semibold text-navy transition hover:bg-white"
                    >
                      View Offers
                    </Link>
                  </div>
                </article>
              </SwiperSlide>
            ))}
          </Swiper>
        </Reveal>
      </div>
    </section>
  );
}
