"use client";

import Image from "next/image";

const airlineLogos: Record<string, { src: string; alt: string }> = {
  BS: {
    src: "/images/air_company/us_bangla_icon.jpeg",
    alt: "US-Bangla Airlines",
  },
  BG: {
    src: "/images/air_company/biman_bangladesh_icon.jpg",
    alt: "Biman Bangladesh Airlines",
  },
  VQ: {
    src: "/images/air_company/novo_air_icon.jpg",
    alt: "Novoair",
  },
};

const fallbackTones: Record<string, string> = {
  BS: "bg-[#e0f2fe] text-[#0284c7]",
  BG: "bg-[#fef3c7] text-[#b45309]",
  VQ: "bg-[#dcfce7] text-[#15803d]",
  FZ: "bg-[#fff7ed] text-[#c2410c]",
  QR: "bg-[#f3e8ff] text-[#7c3aed]",
  EK: "bg-[#fef2f2] text-[#b91c1c]",
  UL: "bg-[#ecfeff] text-[#0e7490]",
};

const sizes = {
  sm: { box: "h-9 w-9", fallback: "h-9 w-9 text-[10px]", image: "36px" },
  md: { box: "h-11 w-11", fallback: "h-11 w-11 text-[11px]", image: "44px" },
  lg: { box: "h-14 w-14", fallback: "h-14 w-14 text-[13px]", image: "56px" },
};

export default function AirlineMark({
  code,
  large = false,
  size,
}: {
  code: string;
  large?: boolean;
  size?: keyof typeof sizes;
}) {
  const resolved = size ?? (large ? "lg" : "md");
  const logo = airlineLogos[code];

  if (logo) {
    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-aerotake-border/70 ${sizes[resolved].box}`}
      >
        <Image
          src={logo.src}
          alt={logo.alt}
          fill
          sizes={sizes[resolved].image}
          className="object-contain p-1"
        />
      </span>
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
        fallbackTones[code] ?? "bg-aerotake-canvas text-aerotake-navy"
      } ${sizes[resolved].fallback}`}
    >
      {code}
    </span>
  );
}
