export const SITE = {
  name: "Aerotake",
  tagline: "Plan. Book. Fly.",
  phoneDisplay: "+44 800 123 456",
  phoneTel: "+44800123456",
  email: "hello@aerotake.com",
  address: "58 Commercial Road, Fratton, Portsmouth PO1 1BA, United Kingdom",
  hours: "Mon – Sat: 8am – 5pm · Sunday: Closed",
} as const;

export const NAV_LINKS = [
  { label: "Flights", href: "/" },
  { label: "My Bookings", href: "/my-bookings" },
  { label: "Manage Booking", href: "/manage-booking" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
] as const;
