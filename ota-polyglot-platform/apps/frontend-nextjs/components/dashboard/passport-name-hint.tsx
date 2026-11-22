"use client";

import Image from "next/image";

export type PassportHintField = "firstName" | "lastName";

const hintImages: Record<
  PassportHintField,
  { src: string; alt: string; width: number; height: number }
> = {
  firstName: {
    src: "/images/given_name.png",
    alt: "Passport sample highlighting the given name field",
    width: 477,
    height: 331,
  },
  lastName: {
    src: "/images/surename.png",
    alt: "Passport sample highlighting the surname field",
    width: 477,
    height: 328,
  },
};

export default function PassportNameHint({ field }: { field: PassportHintField }) {
  const hint = hintImages[field];

  return (
    <div
      role="tooltip"
      className="inline-block max-w-full overflow-hidden rounded-md border border-aerotake-border leading-none shadow-[0_8px_24px_rgba(15,23,42,0.14)]"
    >
      <Image
        src={hint.src}
        alt={hint.alt}
        width={hint.width}
        height={hint.height}
        className="block h-auto w-[220px] max-w-full sm:w-[260px]"
      />
    </div>
  );
}
