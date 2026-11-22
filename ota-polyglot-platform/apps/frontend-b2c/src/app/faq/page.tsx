"use client";

import { useState } from "react";

const faqs = [
  {
    q: "Do I need an account to book?",
    a: "Yes. Sign in or create an account before you reserve seats. Searching flights stays open without an account. If you already have a booking reference, use Manage booking.",
  },
  {
    q: "Is my ticket issued when I reserve?",
    a: "No. Reserving holds your seats with the airline for a limited time. You then pay with your Aerotake wallet or by card on our payment partner’s page (SSLCommerz). When payment succeeds, we issue your ticket. If you don’t pay before the hold ends, the seats are released.",
  },
  {
    q: "Where do I enter my card details?",
    a: "If you pay by card, on the SSLCommerz payment page after you reserve — not on this website. We never see your full card number. Paying with your Aerotake wallet stays on this site and uses the balance you added.",
  },
  {
    q: "How do I find my booking?",
    a: "Open the link we emailed you, or use Manage booking with your booking reference and a traveller's last name. If you booked while signed in, it is under My bookings.",
  },
  {
    q: "How do I get my e-ticket?",
    a: "After payment and ticketing, open View / print e-ticket from confirmation, My bookings, or Manage booking — or use the link in your ticket email. Use your browser’s Print dialog to save a PDF. Bring your booking reference to the airport; the page is an itinerary, not a boarding pass.",
  },
  {
    q: "Can I cancel a booking?",
    a: "Yes from My bookings or Manage booking. An unpaid hold is cancelled immediately. If you paid but the ticket is not issued yet, we cancel and refund through the payment gateway. An issued ticket becomes a cancellation request for our team — refunds are not automatic.",
  },
  {
    q: "Can the price change?",
    a: "The price shown includes taxes and fees. Airlines can reprice before a seat is held, so we check the fare with the airline when you reserve and show you the new price if it changed.",
  },
  {
    q: "Can I book with an infant?",
    a: "Yes. Add an infant (under 2) in the traveller selector — one infant per adult. Search prices include infant fares when the airline offers them. At checkout, enter the infant’s passport details and date of birth; the infant travels on an adult’s lap (no separate seat).",
  },
];

export default function FaqPage() {
  const [open, setOpen] = useState(0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
      <h1 className="mb-8 text-3xl font-bold text-navy sm:text-4xl">FAQ</h1>
      <div className="space-y-3">
        {faqs.map((item, index) => {
          const isOpen = open === index;
          return (
            <div key={item.q} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                type="button"
                aria-expanded={isOpen}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left text-[15px] font-semibold text-navy"
                onClick={() => setOpen(isOpen ? -1 : index)}
              >
                {item.q}
                <span className="text-slate" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen ? (
                <p className="border-t border-border px-4 py-3 text-[15px] text-slate">{item.a}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
