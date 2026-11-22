"use client";

export function profileInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "AT"
  );
}

export default function ProfileAvatar({
  name,
  avatarUrl,
  size = "md",
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-10 w-10 text-[12px]",
    md: "h-14 w-14 text-[15px]",
    lg: "h-20 w-20 text-[20px]",
  };

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#fff1f0] font-bold text-aerotake-coral ring-2 ring-white ${sizes[size]} ${className}`}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local/data URLs from file picker
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        profileInitials(name)
      )}
    </span>
  );
}
