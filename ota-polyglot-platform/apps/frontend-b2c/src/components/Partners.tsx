import Image from "next/image";
import { Reveal } from "@/components/motion/Reveal";

const airlines = [
  { name: "Emirates", logo: "/images/partners/emirates.svg" },
  { name: "Qatar Airways", logo: "/images/partners/qatar-airways.svg" },
  { name: "British Airways", logo: "/images/partners/british-airways.svg" },
  { name: "Singapore Airlines", logo: "/images/partners/singapore-airlines.svg" },
  { name: "Turkish Airlines", logo: "/images/partners/turkish-airlines.svg" },
  { name: "Etihad", logo: "/images/partners/etihad.svg" },
  { name: "Lufthansa", logo: "/images/partners/lufthansa.svg" },
  { name: "Cathay Pacific", logo: "/images/partners/cathay-pacific.svg" },
];

export default function Partners() {
  const loop = [...airlines, ...airlines];

  return (
    <section className="overflow-x-hidden bg-card px-4 pb-24 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px]">
        <Reveal delay={0.08} className="mb-10 text-center">
          <p className="text-xl font-normal leading-8 text-slate sm:text-[22px] sm:leading-[30px]">
            Search fares from airlines around the world
          </p>
        </Reveal>

        <Reveal delay={0.12} className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-card to-transparent sm:w-20" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-card to-transparent sm:w-20" />

          <div className="flex w-max animate-partner-marquee gap-5">
            {loop.map((airline, index) => (
              <div
                key={`${airline.name}-${index}`}
                className="flex h-[60px] w-[180px] shrink-0 items-center justify-center rounded-full border border-border bg-card px-5 md:h-[70px] md:w-[203px]"
              >
                <Image
                  src={airline.logo}
                  alt={airline.name}
                  width={150}
                  height={36}
                  className="h-8 w-auto max-w-[150px] object-contain md:h-9"
                />
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
