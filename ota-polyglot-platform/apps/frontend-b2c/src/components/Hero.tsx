"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState, useSyncExternalStore } from "react";
import FlightSearchForm from "@/components/flights/FlightSearchForm";

const tabs = [
  { id: "flights", label: "Flights" },
  { id: "hotels", label: "Hotels" },
  { id: "tours", label: "Tours" },
  { id: "transport", label: "Transport" },
  { id: "experience", label: "Experience" },
  { id: "visa", label: "Visa" },
] as const;

function subscribe() {
  return () => undefined;
}

function getPlayVideo() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = window.matchMedia("(max-width: 767px)").matches;
  return !reduce && !narrow;
}

export default function Hero() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("flights");
  const playVideo = useSyncExternalStore(subscribe, getPlayVideo, () => false);
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative">
      <div className="relative px-2.5 md:px-[15px] xl:px-6">
        <div className="relative h-[300px] overflow-hidden rounded-[10px] md:h-[360px] md:rounded-[15px] xl:h-[400px] xl:rounded-[20px]">
          {playVideo ? (
            <motion.video
              className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
              autoPlay
              muted
              loop
              playsInline
              poster="/images/offers/plane.jpg"
              initial={reduceMotion ? false : { scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <source src="/videos/hero.mp4" type="video/mp4" />
            </motion.video>
          ) : (
            <motion.img
              src="/images/offers/plane.jpg"
              alt=""
              className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
              initial={reduceMotion ? false : { scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            />
          )}

          <div
            className="absolute inset-0 rounded-[inherit]"
            style={{ backgroundImage: "var(--hero-overlay)" }}
          />

          <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 pb-24 pt-8 text-center max-md:justify-start max-md:pb-36 max-md:pt-14 sm:px-8 xl:pb-28">
            <motion.h1
              className="max-w-5xl text-[32px] font-bold leading-[1.2] tracking-tight text-white sm:text-[40px] md:text-[50px] xl:text-[58px]"
              initial={reduceMotion ? false : { opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              Discover the Extraordinary
            </motion.h1>
            <motion.p
              className="mt-4 max-w-2xl text-base font-medium leading-7 text-white/90 max-md:mt-3 max-md:text-[15px] max-md:leading-6 sm:text-[17px]"
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              Search and compare flights from airlines around the world.
            </motion.p>
          </div>
        </div>
      </div>

      <motion.div
        className="relative z-20 -mt-[110px] w-full px-4 max-md:-mt-[140px] max-md:px-3 sm:px-6 lg:px-8"
        initial={reduceMotion ? false : { opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mx-auto w-full max-w-[1320px]">
          <div
            className="rounded-[10px] bg-card px-4 py-6 max-md:rounded-[24px] max-md:px-3.5 max-md:py-5 sm:rounded-[15px] sm:px-5 sm:py-7 xl:px-8"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="mb-5 flex flex-wrap items-center gap-2 max-md:mb-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1 max-md:[-ms-overflow-style:none] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden sm:gap-3">
              {tabs.map((tab, i) => {
                const active = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: 0.65 + i * 0.05,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                    className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 py-2 text-[13px] font-semibold transition max-md:min-h-10 sm:text-[15px] ${
                      active
                        ? "bg-primary-strong text-white"
                        : "bg-primary-tint text-primary-strong"
                    }`}
                  >
                    {tab.label}
                  </motion.button>
                );
              })}
            </div>

            {activeTab === "flights" ? (
              <FlightSearchForm />
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-bg px-4 py-8 text-center text-sm text-slate">
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} booking is coming soon. For now, you can search and book flights.
              </p>
            )}

          </div>
        </div>
      </motion.div>
    </section>
  );
}
