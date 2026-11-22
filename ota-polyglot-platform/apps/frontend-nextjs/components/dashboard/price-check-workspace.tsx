"use client";

import { useEffect, useMemo, useState } from "react";
import AirlineMark from "./airline-mark";
import BookingSearch, { type FlightSearchQuery } from "./booking-search";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { ExternalIcon } from "./icons";

type LiveSegment = {
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTimeLocal: string;
  arrivalTimeLocal: string;
  legIndex?: number;
};

type LiveOffer = {
  offerId: string;
  sellPrice: number;
  currency: string;
  segments: LiveSegment[];
};

type CompetitorId = "sharetrip" | "firsttrip" | "usbair";

type PastedMap = Record<string, Partial<Record<CompetitorId, string>>>;

type ComparedRow = {
  matchKey: string;
  offerId: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  origin: string;
  destination: string;
  sellPrice: number;
  currency: string;
};

const PASTED_STORAGE_KEY = "ota:price-check:pasted-fares";
const USB_AIRLINE = "BS";

function localHHmm(iso: string) {
  return iso.slice(11, 16) || "—";
}

function matchKey(airline: string, flightNumber: string, departureTime: string) {
  return `${airline}|${flightNumber}|${departureTime}`;
}

function parseFare(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[, ]/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatMoney(amount: number, currency: string) {
  const code = currency || "BDT";
  return `${code} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function cityName(value: string) {
  return value.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim() || value;
}

function cabinClass(cabin: string) {
  return cabin === "business" || cabin === "first" ? "Business" : "Economy";
}

function competitorLinks(query: FlightSearchQuery) {
  const origin = query.from.code;
  const destination = query.to.code;
  const originCity = cityName(query.from.city);
  const destinationCity = cityName(query.to.city);
  const originAirport = query.from.airport;
  const destinationAirport = query.to.airport;
  const depart = query.departureDate;
  const adults = String(Math.max(1, query.travelers || 1));
  const cabin = cabinClass(query.cabin);
  const oneWay = query.tripType !== "round-trip";

  const sharetrip = new URLSearchParams({
    adult: adults,
    child: "0",
    child2To5Count: "0",
    child6To12Count: "0",
    infant: "0",
    class: cabin,
    depart,
    origin,
    originCity,
    originAirport,
    destination,
    destinationCity,
    destinationAirport,
    tripType: oneWay ? "OneWay" : "RoundTrip",
  });
  if (!oneWay && query.returnDate) sharetrip.set("return", query.returnDate);

  const firsttrip = new URLSearchParams({
    from: origin,
    to: destination,
    origin,
    destination,
    originCity,
    destinationCity,
    departDate: depart,
    date: depart,
    tripType: oneWay ? "oneway" : "roundtrip",
    adults,
    class: cabin,
  });
  if (!oneWay && query.returnDate) {
    firsttrip.set("returnDate", query.returnDate);
    firsttrip.set("return", query.returnDate);
  }

  const usbair = new URLSearchParams({
    from: origin,
    to: destination,
    date: depart,
    tripType: oneWay ? "oneway" : "roundtrip",
  });
  if (!oneWay && query.returnDate) usbair.set("return", query.returnDate);

  return {
    sharetrip: `https://sharetrip.net/flight-search?${sharetrip.toString()}`,
    firsttrip: `https://firsttrip.com/flight?${firsttrip.toString()}`,
    usbair: `https://usbair.com/book-a-flight?${usbair.toString()}`,
  } as const;
}

function readPasted(): PastedMap {
  try {
    const raw = sessionStorage.getItem(PASTED_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PastedMap) : {};
  } catch {
    return {};
  }
}

function writePasted(map: PastedMap) {
  try {
    sessionStorage.setItem(PASTED_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

function deltaTone(ours: number, theirs: number | null) {
  if (theirs == null) return "text-aerotake-muted";
  if (theirs < ours) return "text-red-600";
  if (theirs > ours) return "text-aerotake-success";
  return "text-aerotake-muted";
}

function openPortal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function PriceCheckWorkspace() {
  const [query, setQuery] = useState<FlightSearchQuery | null>(null);
  const [rows, setRows] = useState<ComparedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState<PastedMap>({});

  useEffect(() => {
    setPasted(readPasted());
  }, []);

  useEffect(() => {
    if (!query) return;
    const current = query;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const body: Record<string, unknown> = {
          productType: "PRODUCT_TYPE_FLIGHT",
          adults: Math.max(1, current.travelers || 1),
          origin: current.from.code,
          destination: current.to.code,
          checkIn: current.departureDate,
        };
        if (current.tripType === "round-trip" && current.returnDate) {
          body.checkOut = current.returnDate;
        }

        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`search_failed_${res.status}`);
        const data = (await res.json()) as { offers?: LiveOffer[] };
        const next = (data.offers ?? [])
          .filter((offer) => offer.segments?.length)
          .map((offer) => {
            const outbound = offer.segments.filter((s) => (s.legIndex ?? 0) === 0);
            const first = outbound[0] ?? offer.segments[0];
            const airline = first.airlineCode || "—";
            const flightNumber = first.flightNumber || "—";
            const departureTime = localHHmm(first.departureTimeLocal);
            return {
              matchKey: matchKey(airline, flightNumber, departureTime),
              offerId: offer.offerId,
              airline,
              flightNumber,
              departureTime,
              origin: first.origin,
              destination: outbound[outbound.length - 1]?.destination ?? first.destination,
              sellPrice: offer.sellPrice,
              currency: offer.currency || "BDT",
            } satisfies ComparedRow;
          });
        if (!cancelled) setRows(next);
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Could not load our fares. Search itself is unchanged — retry this page.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const links = useMemo(() => (query ? competitorLinks(query) : null), [query]);

  function updatePasted(key: string, competitor: CompetitorId, value: string) {
    setPasted((current) => {
      const next = {
        ...current,
        [key]: { ...current[key], [competitor]: value },
      };
      writePasted(next);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-8">
      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
        <p className="font-semibold">Price Check — Dev / QA only</p>
        <p className="mt-1 leading-5">
          Our sell price loads automatically. Use <span className="font-semibold">Open</span> in a
          competitor column to open that public portal with this route and date already filled.
          Paste the matching flight’s fare back here. This page does not book, hold, or change Search.
        </p>
      </div>

      <BookingSearch onSearch={setQuery} hasResults={Boolean(query)} />

      {query ? (
        <div className="mt-5 rounded-2xl border border-aerotake-border bg-white p-4 shadow-sm">
          <div>
            <p className="text-[15px] font-semibold text-aerotake-navy">
              {query.from.code} → {query.to.code} · {query.departureLabel || query.departureDate}
            </p>
            <p className="mt-0.5 text-[12px] text-aerotake-muted">
              Match key is airline + flight number + departure time. usbair.com Open is only for
              US-Bangla (BS).
            </p>
          </div>

          {loading ? (
            <div className="mt-8 flex items-center justify-center gap-2 py-10 text-[13px] text-aerotake-muted">
              <ButtonSpinner className="h-4 w-4" />
              Loading our fares…
            </div>
          ) : error ? (
            <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>
          ) : rows.length === 0 ? (
            <p className="mt-6 text-[13px] text-aerotake-muted">No live offers for this search.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] tracking-wide text-aerotake-muted uppercase">
                    <th className="border-b border-aerotake-border px-3 py-2 font-semibold">Flight</th>
                    <th className="border-b border-aerotake-border px-3 py-2 font-semibold">Our sell</th>
                    <HeaderOpen label="ShareTrip" href={links?.sharetrip} />
                    <HeaderOpen label="Firsttrip" href={links?.firsttrip} />
                    <HeaderOpen label="usbair.com" href={links?.usbair} />
                    <th className="border-b border-aerotake-border px-3 py-2 font-semibold">Vs cheapest paste</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const cells = pasted[row.matchKey] ?? {};
                    const sharetrip = parseFare(cells.sharetrip);
                    const firsttrip = parseFare(cells.firsttrip);
                    const usbair = row.airline === USB_AIRLINE ? parseFare(cells.usbair) : null;
                    const pastedValues = [sharetrip, firsttrip, usbair].filter(
                      (value): value is number => value != null,
                    );
                    const cheapest = pastedValues.length ? Math.min(...pastedValues) : null;
                    const vs = cheapest == null ? null : cheapest - row.sellPrice;

                    return (
                      <tr key={row.offerId} className="align-top">
                        <td className="border-b border-aerotake-border px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <AirlineMark code={row.airline} size="sm" />
                            <div>
                              <p className="font-semibold text-aerotake-navy">
                                {row.airline} {row.flightNumber}
                              </p>
                              <p className="text-[12px] text-aerotake-muted">
                                {row.origin} {row.departureTime} → {row.destination}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-aerotake-border px-3 py-3 font-semibold text-aerotake-navy">
                          {formatMoney(row.sellPrice, row.currency)}
                        </td>
                        <FareCell
                          value={cells.sharetrip ?? ""}
                          onChange={(value) => updatePasted(row.matchKey, "sharetrip", value)}
                          href={links?.sharetrip}
                          ours={row.sellPrice}
                          parsed={sharetrip}
                        />
                        <FareCell
                          value={cells.firsttrip ?? ""}
                          onChange={(value) => updatePasted(row.matchKey, "firsttrip", value)}
                          href={links?.firsttrip}
                          ours={row.sellPrice}
                          parsed={firsttrip}
                        />
                        {row.airline === USB_AIRLINE ? (
                          <FareCell
                            value={cells.usbair ?? ""}
                            onChange={(value) => updatePasted(row.matchKey, "usbair", value)}
                            href={links?.usbair}
                            ours={row.sellPrice}
                            parsed={usbair}
                          />
                        ) : (
                          <td className="border-b border-aerotake-border px-3 py-3 text-aerotake-muted">
                            —
                          </td>
                        )}
                        <td className={`border-b border-aerotake-border px-3 py-3 font-medium ${deltaTone(row.sellPrice, cheapest)}`}>
                          {vs == null
                            ? "Paste a fare"
                            : vs === 0
                              ? "Match"
                              : vs < 0
                                ? `${formatMoney(Math.abs(vs), row.currency)} cheaper than us`
                                : `${formatMoney(vs, row.currency)} we are cheaper`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-6 text-center text-[13px] text-aerotake-muted">
          Run the same flight search you would on Search. Results stay on this page only.
        </p>
      )}
    </div>
  );
}

function HeaderOpen({ label, href }: { label: string; href?: string }) {
  return (
    <th className="border-b border-aerotake-border px-3 py-2 font-semibold">
      <div className="flex items-center gap-2 normal-case tracking-normal">
        <span className="text-[11px] tracking-wide uppercase">{label}</span>
        {href ? (
          <button
            type="button"
            onClick={() => openPortal(href)}
            className="inline-flex h-6 items-center gap-1 rounded-md bg-aerotake-navy px-2 text-[10px] font-semibold text-white hover:bg-slate-800"
          >
            Open
            <ExternalIcon />
          </button>
        ) : null}
      </div>
    </th>
  );
}

function FareCell({
  value,
  onChange,
  href,
  ours,
  parsed,
}: {
  value: string;
  onChange: (value: string) => void;
  href?: string;
  ours: number;
  parsed: number | null;
}) {
  return (
    <td className="border-b border-aerotake-border px-3 py-3">
      <div className="flex items-center gap-2">
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Paste"
          className="h-9 w-[104px] rounded-md border border-aerotake-border px-2 text-[13px] text-aerotake-navy outline-none focus:border-aerotake-coral"
        />
        {href ? (
          <button
            type="button"
            onClick={() => openPortal(href)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-aerotake-border px-2 text-[11px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
            aria-label="Open competitor search"
          >
            Open
            <ExternalIcon />
          </button>
        ) : null}
      </div>
      {parsed != null ? (
        <p className={`mt-1 text-[11px] ${deltaTone(ours, parsed)}`}>
          {parsed < ours ? "Lower than us" : parsed > ours ? "Higher than us" : "Same"}
        </p>
      ) : null}
    </td>
  );
}
