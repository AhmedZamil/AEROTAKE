"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";

const reviews = [
  {
    title: "Happy Travel!",
    body: "Our honeymoon package was beyond amazing! Every detail was handled perfectly from booking to return.",
    name: "Denial Kim",
    time: "12 March 2026",
    avatar: "/images/avatars/avatar-1.jpg",
  },
  {
    title: "Perfect Agency!",
    body: "Aerotake planned our family trip so smoothly. The itinerary was balanced, flexible, and truly memorable.",
    name: "David Miller",
    time: "5 March 2026",
    avatar: "/images/avatars/avatar-2.jpg",
  },
  {
    title: "Excellent Trip!",
    body: "From airport pickup to hotel check-in, everything was seamless. Highly recommend for international travel.",
    name: "James Wilson",
    time: "28 February 2026",
    avatar: "/images/avatars/avatar-3.jpg",
  },
  {
    title: "Great Support!",
    body: "Their 24/7 support team helped us adjust plans mid-trip without stress. Outstanding service overall.",
    name: "Emelia Jong",
    time: "18 February 2026",
    avatar: "/images/avatars/avatar-4.jpg",
  },
  {
    title: "Perfect Itinerary!",
    body: "Our Vietnam journey was perfectly organized from start to finish. We felt cared for the entire way.",
    name: "Anderson Lee",
    time: "2 February 2026",
    avatar: "/images/avatars/avatar-1.jpg",
  },
];

const CARD_STEP = 360;

function RatingDots({ count = 5 }: { count?: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${count} out of 5`}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full bg-primary" />
      ))}
    </span>
  );
}

function ReviewCard({
  review,
}: {
  review: (typeof reviews)[number];
}) {
  return (
    <article className="flex w-[300px] shrink-0 flex-col rounded-[20px] bg-card p-6 shadow-lg sm:w-[340px] sm:p-7">
      <h3 className="mb-3 text-xl font-bold text-navy">{review.title}</h3>
      <p className="mb-6 flex-1 text-[15px] leading-relaxed text-slate">{review.body}</p>
      <div className="flex items-center gap-3 rounded-full border border-border px-3 py-2.5">
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-border">
          <Image
            src={review.avatar}
            alt={review.name}
            fill
            sizes="40px"
            className="object-cover"
          />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy">{review.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <RatingDots />
            <span className="text-xs text-slate">{review.time}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function Reviews() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  const scrollByCard = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return;

    let next = el.scrollLeft + dir * CARD_STEP;

    if (dir === 1 && next >= maxScroll - 4) {
      next = 0;
    } else if (dir === -1 && next <= 4) {
      next = maxScroll;
    }

    el.scrollTo({ left: next, behavior: "smooth" });
  };

  useEffect(() => {
    if (paused) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const id = window.setInterval(() => scrollByCard(1), 3500);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section className="bg-navy px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-[1320px]">
        <Reveal className="mb-10 text-center text-white">
          <p className="mb-2 text-sm font-medium text-primary sm:text-base">
            Customer experience at Aerotake
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-[42px]">
            What&apos;s the People Say
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div
            className="relative"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setPaused(false);
              }
            }}
          >
            <button
              type="button"
              aria-label="Previous reviews"
              onClick={() => scrollByCard(-1)}
              className="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30 lg:flex"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
                <path d="M4.11 7.45 10.34 1.22A1.1 1.1 0 0 1 11.88 1.22l.46.46a1.1 1.1 0 0 1 0 1.54L6.65 8l5.24 5.24a1.1 1.1 0 0 1 0 1.54l-.46.46a1.1 1.1 0 0 1-1.54 0L4.11 8.54a1.1 1.1 0 0 1 0-1.09Z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next reviews"
              onClick={() => scrollByCard(1)}
              className="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30 lg:flex"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
                <path d="M11.78 7.45 5.72 1.22A1.1 1.1 0 0 0 4.22 1.22l-.45.46a1.1 1.1 0 0 0 0 1.54L9.31 8l-5.1 5.24a1.1 1.1 0 0 0 0 1.54l.45.46a1.1 1.1 0 0 0 1.5 0l6.07-6.24a1.1 1.1 0 0 0 0-1.09Z" />
              </svg>
            </button>

            <div
              ref={scrollerRef}
              className="flex gap-5 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {reviews.map((review) => (
                <ReviewCard key={`${review.name}-${review.title}`} review={review} />
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal
          delay={0.15}
          className="mt-10 flex flex-wrap items-center justify-center gap-3 text-center text-white/80"
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold tracking-wide text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
              <path d="M12 2c2.2 3.8 3 6.8 3 9.2A5 5 0 1 1 7 11.2C7 8.8 7.8 5.8 12 2Zm0 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
            </svg>
            TripAdvisor
          </span>
          <RatingDots />
          <p className="text-sm font-medium text-white/80 sm:text-base">
            4.8 rated 10,000 real traveler at Aerotake.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
