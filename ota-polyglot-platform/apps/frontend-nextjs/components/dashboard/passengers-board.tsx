"use client";

import { useMemo, useState } from "react";
import {
  dummyPassengers,
  isPassportExpiring,
  passengerName,
  passengerTypeMeta,
  type Passenger,
  type PassengerGender,
  type PassengerType,
} from "@/data/passengers";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  PassengersIcon,
  SearchIcon,
  UserIcon,
  UserPlusIcon,
} from "./icons";

const pageSizeOptions = [10, 20, 50];
const titles = ["Mr", "Mrs", "Ms", "Mstr", "Miss"] as const;

const typeFilters: { id: "all" | PassengerType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "adult", label: "Adult" },
  { id: "child", label: "Child" },
  { id: "infant", label: "Infant" },
];

const emptyForm = {
  title: "Mr" as Passenger["title"],
  firstName: "",
  lastName: "",
  type: "adult" as PassengerType,
  gender: "male" as PassengerGender,
  dateOfBirth: "",
  nationality: "Bangladesh",
  passportNo: "",
  passportExpiry: "",
  phone: "",
  email: "",
  frequentFlyer: "",
};

export default function PassengersBoard() {
  const [passengers, setPassengers] = useState(dummyPassengers);
  const [nameDraft, setNameDraft] = useState("");
  const [passportDraft, setPassportDraft] = useState("");
  const [applied, setApplied] = useState({ name: "", passport: "" });
  const [typeFilter, setTypeFilter] = useState<"all" | PassengerType>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [form, setForm] = useState(emptyForm);

  const counts = useMemo(
    () => ({
      total: passengers.length,
      adult: passengers.filter((item) => item.type === "adult").length,
      child: passengers.filter((item) => item.type === "child").length,
      infant: passengers.filter((item) => item.type === "infant").length,
      expiring: passengers.filter((item) => isPassportExpiring(item)).length,
    }),
    [passengers],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return passengers.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (applied.name && !passengerName(item).toLowerCase().includes(applied.name.toLowerCase())) {
        return false;
      }
      if (
        applied.passport &&
        !item.passportNo.toLowerCase().includes(applied.passport.toLowerCase())
      ) {
        return false;
      }
      if (!query) return true;
      return [
        item.id,
        passengerName(item),
        item.passportNo,
        item.nationality,
        item.email,
        item.phone,
        item.frequentFlyer ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [applied, passengers, search, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const fromCount = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toCount = Math.min(currentPage * pageSize, filtered.length);

  function applyFilters() {
    setApplied({ name: nameDraft.trim(), passport: passportDraft.trim() });
    setPage(1);
  }

  function clearFilters() {
    setNameDraft("");
    setPassportDraft("");
    setApplied({ name: "", passport: "" });
    setTypeFilter("all");
    setSearch("");
    setPage(1);
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(passenger: Passenger) {
    setEditingId(passenger.id);
    setForm({
      title: passenger.title,
      firstName: passenger.firstName,
      lastName: passenger.lastName,
      type: passenger.type,
      gender: passenger.gender,
      dateOfBirth: passenger.dateOfBirth,
      nationality: passenger.nationality,
      passportNo: passenger.passportNo,
      passportExpiry: passenger.passportExpiry,
      phone: passenger.phone,
      email: passenger.email,
      frequentFlyer: passenger.frequentFlyer ?? "",
    });
    setFormOpen(true);
  }

  function savePassenger() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.passportNo.trim()) {
      return;
    }

    const next: Passenger = {
      id: editingId ?? `PAX-${Date.now().toString().slice(-6)}`,
      title: form.title,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      type: form.type,
      gender: form.gender,
      dateOfBirth: form.dateOfBirth.trim() || "01 Jan 2000",
      nationality: form.nationality.trim() || "Bangladesh",
      passportNo: form.passportNo.trim().toUpperCase(),
      passportExpiry: form.passportExpiry.trim() || "31 Dec 2030",
      passportExpiryIso: "2030-12-31",
      phone: form.phone.trim(),
      email: form.email.trim(),
      frequentFlyer: form.frequentFlyer.trim() || null,
      lastUsed: "24 Aug 2026",
      lastUsedIso: "2026-08-24",
      trips: editingId
        ? (passengers.find((item) => item.id === editingId)?.trips ?? 0)
        : 0,
    };

    setPassengers((current) =>
      editingId
        ? current.map((item) => (item.id === editingId ? next : item))
        : [next, ...current],
    );
    setFormOpen(false);
    setSelected(next);
    setPage(1);
  }

  function removePassenger(id: string) {
    setPassengers((current) => current.filter((item) => item.id !== id));
    setSelected((item) => (item?.id === id ? null : item));
  }

  const cards = [
    {
      id: "all" as const,
      label: "Saved Passengers",
      value: counts.total,
      tone: "text-aerotake-navy",
      icon: "bg-[#fff1f0] text-aerotake-coral",
    },
    {
      id: "adult" as const,
      label: "Adults",
      value: counts.adult,
      tone: "text-[#2563eb]",
      icon: "bg-[#eff6ff] text-[#2563eb]",
    },
    {
      id: "child" as const,
      label: "Children",
      value: counts.child,
      tone: "text-[#c2410c]",
      icon: "bg-[#fff7ed] text-[#c2410c]",
    },
    {
      id: "infant" as const,
      label: "Infants",
      value: counts.infant,
      tone: "text-[#7c3aed]",
      icon: "bg-[#f3e8ff] text-[#7c3aed]",
    },
  ];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1360px] flex-col gap-5 px-3 py-4 pb-24 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-aerotake-navy">Passengers</h1>
          <p className="mt-1 text-[13px] text-aerotake-muted">
            Save traveler profiles, passport details, and frequent-flyer numbers for faster booking.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(249,115,96,0.28)] hover:bg-aerotake-coral-dark sm:w-auto"
        >
          <UserPlusIcon className="h-4 w-4" />
          Add Passenger
        </button>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder="Passenger name"
              className="h-11 w-full rounded-lg border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
            />
            <input
              value={passportDraft}
              onChange={(event) => setPassportDraft(event.target.value)}
              placeholder="Passport number"
              className="h-11 w-full rounded-lg border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={applyFilters}
              className="h-11 w-full rounded-lg bg-aerotake-navy px-5 text-[13px] font-semibold text-white hover:bg-[#1e293b] sm:min-w-[128px] sm:w-auto"
            >
              Apply Filter
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="h-11 w-full rounded-lg border border-aerotake-coral bg-white px-5 text-[13px] font-semibold text-aerotake-coral hover:bg-[#fff1f0] sm:min-w-[110px] sm:w-auto"
            >
              Clear All
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => {
          const active = typeFilter === card.id || (card.id === "all" && typeFilter === "all");
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                setTypeFilter(card.id);
                setPage(1);
              }}
              className={`rounded-2xl bg-white p-3 text-left shadow-[0_10px_32px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 sm:p-5 ${
                active ? "ring-2 ring-aerotake-coral/25" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-aerotake-muted sm:text-[13px]">{card.label}</p>
                  <p className={`mt-1.5 text-[24px] leading-none font-bold sm:mt-2 sm:text-[32px] ${card.tone}`}>
                    {String(card.value).padStart(2, "0")}
                  </p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${card.icon}`}>
                  {card.id === "all" ? (
                    <PassengersIcon className="h-5 w-5" />
                  ) : (
                    <UserIcon className="h-5 w-5" />
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {counts.expiring ? (
        <p className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-[13px] text-[#9a3412]">
          {counts.expiring} passport{counts.expiring === 1 ? "" : "s"} expire within 6 months. Update
          documents before ticketing.
        </p>
      ) : null}

      <section className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {typeFilters.map((item) => {
              const active = typeFilter === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTypeFilter(item.id);
                    setPage(1);
                  }}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${
                    active
                      ? "bg-aerotake-coral text-white"
                      : "bg-aerotake-canvas text-aerotake-navy hover:bg-[#e8eaed]"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-[13px] text-aerotake-muted">
              Show
              <span className="relative">
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="h-9 appearance-none rounded-lg border border-aerotake-border bg-white py-0 pr-8 pl-3 text-[13px] text-aerotake-navy outline-none"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </span>
              </span>
            </label>
            <label className="relative w-full sm:w-[240px]">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-aerotake-muted">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search passengers..."
                className="h-10 w-full rounded-xl border border-aerotake-border bg-white pr-3 pl-9 text-[13px] text-aerotake-navy outline-none placeholder:text-aerotake-muted focus:border-aerotake-coral"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 space-y-3 md:hidden">
          {visible.length ? (
            visible.map((item) => {
              const meta = passengerTypeMeta[item.type];
              const expiring = isPassportExpiring(item);
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-aerotake-border bg-[#f8fafc] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-aerotake-navy">
                        {passengerName(item)}
                      </p>
                      <p className="mt-0.5 text-[12px] text-aerotake-muted">
                        {item.id} · DOB {item.dateOfBirth}
                      </p>
                      {item.frequentFlyer ? (
                        <p className="mt-0.5 text-[11px] text-aerotake-coral">{item.frequentFlyer}</p>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Passport
                      </p>
                      <p className="mt-0.5 text-[13px] font-bold text-aerotake-navy">{item.passportNo}</p>
                      <p
                        className={`mt-0.5 text-[11px] ${
                          expiring ? "font-semibold text-aerotake-coral" : "text-aerotake-muted"
                        }`}
                      >
                        Exp. {item.passportExpiry}
                        {expiring ? " · Update soon" : ""}
                      </p>
                    </div>
                    <div className="rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Last used
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-aerotake-navy">{item.lastUsed}</p>
                      <p className="mt-0.5 text-[11px] text-aerotake-muted">{item.trips} trips</p>
                    </div>
                    <div className="col-span-2 rounded-lg border border-aerotake-border bg-white px-3 py-2">
                      <p className="text-[10px] font-semibold tracking-wide text-aerotake-muted uppercase">
                        Contact
                      </p>
                      <p className="mt-0.5 break-words text-[12px] text-aerotake-navy">
                        {item.phone || "—"}
                      </p>
                      <p className="mt-0.5 break-words text-[12px] text-aerotake-muted">
                        {item.email || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-aerotake-border bg-white text-[12px] font-semibold text-aerotake-navy"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-[#fff1f0] text-[12px] font-semibold text-aerotake-coral"
                    >
                      Edit
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-aerotake-border px-4 py-10 text-center">
              <p className="text-[15px] font-semibold text-aerotake-navy">No passengers found</p>
              <p className="mt-1 text-[13px] text-aerotake-muted">
                Add a traveler profile or clear the current filters.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="bg-[#f8fafc] text-[12px] font-semibold tracking-wide text-aerotake-muted uppercase">
              <tr>
                <th className="rounded-l-xl px-4 py-3">Passenger</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Passport</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Last Used</th>
                <th className="rounded-r-xl px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map((item) => {
                  const meta = passengerTypeMeta[item.type];
                  const expiring = isPassportExpiring(item);
                  return (
                    <tr key={item.id} className="border-t border-aerotake-border/80 hover:bg-[#fffaf8]">
                      <td className="px-4 py-4">
                        <p className="text-[13px] font-semibold text-aerotake-navy">
                          {passengerName(item)}
                        </p>
                        <p className="mt-1 text-[12px] text-aerotake-muted">
                          {item.id} · DOB {item.dateOfBirth}
                        </p>
                        {item.frequentFlyer ? (
                          <p className="mt-0.5 text-[11px] text-aerotake-coral">{item.frequentFlyer}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-[12px]">
                        <p className="font-semibold text-aerotake-navy">{item.passportNo}</p>
                        <p className={`mt-1 ${expiring ? "font-semibold text-aerotake-coral" : "text-aerotake-muted"}`}>
                          Exp. {item.passportExpiry}
                          {expiring ? " · Update soon" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-[12px] text-aerotake-navy">
                        <p>{item.phone || "—"}</p>
                        <p className="mt-1 text-aerotake-muted">{item.email || "—"}</p>
                      </td>
                      <td className="px-4 py-4 text-[12px] whitespace-nowrap text-aerotake-navy">
                        <p>{item.lastUsed}</p>
                        <p className="mt-1 text-aerotake-muted">{item.trips} trips</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelected(item)}
                            className="h-9 rounded-lg border border-aerotake-border px-3 text-[12px] font-semibold text-aerotake-navy hover:bg-aerotake-canvas"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="h-9 rounded-lg bg-[#fff1f0] px-3 text-[12px] font-semibold text-aerotake-coral hover:bg-[#ffe4e0]"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <p className="text-[15px] font-semibold text-aerotake-navy">No passengers found</p>
                    <p className="mt-1 text-[13px] text-aerotake-muted">
                      Add a traveler profile or clear the current filters.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-aerotake-muted">
            {filtered.length
              ? `Showing ${fromCount} to ${toCount} of ${filtered.length} passengers`
              : "No entries to show"}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <PageButton
              ariaLabel="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeftIcon />
            </PageButton>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => (
              <PageButton
                key={item}
                ariaLabel={`Page ${item}`}
                active={item === currentPage}
                onClick={() => setPage(item)}
              >
                {item}
              </PageButton>
            ))}
            <PageButton
              ariaLabel="Next page"
              disabled={currentPage === pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              <ChevronRightIcon />
            </PageButton>
          </div>
        </div>
      </section>

      {formOpen ? (
        <Modal title={editingId ? "Edit Passenger" : "Add Passenger"} onClose={() => setFormOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title">
              <select
                value={form.title}
                onChange={(event) =>
                  setForm((value) => ({ ...value, title: event.target.value as Passenger["title"] }))
                }
                className={fieldClass}
              >
                {titles.map((title) => (
                  <option key={title}>{title}</option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((value) => ({ ...value, type: event.target.value as PassengerType }))
                }
                className={fieldClass}
              >
                <option value="adult">Adult</option>
                <option value="child">Child</option>
                <option value="infant">Infant</option>
              </select>
            </Field>
            <Field label="First name">
              <input
                value={form.firstName}
                onChange={(event) => setForm((value) => ({ ...value, firstName: event.target.value }))}
                placeholder="Rahim"
                className={fieldClass}
              />
            </Field>
            <Field label="Last name">
              <input
                value={form.lastName}
                onChange={(event) => setForm((value) => ({ ...value, lastName: event.target.value }))}
                placeholder="Uddin"
                className={fieldClass}
              />
            </Field>
            <Field label="Date of birth">
              <input
                value={form.dateOfBirth}
                onChange={(event) => setForm((value) => ({ ...value, dateOfBirth: event.target.value }))}
                placeholder="12 Mar 1988"
                className={fieldClass}
              />
            </Field>
            <Field label="Gender">
              <select
                value={form.gender}
                onChange={(event) =>
                  setForm((value) => ({ ...value, gender: event.target.value as PassengerGender }))
                }
                className={fieldClass}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Passport number">
              <input
                value={form.passportNo}
                onChange={(event) => setForm((value) => ({ ...value, passportNo: event.target.value }))}
                placeholder="A01234567"
                className={fieldClass}
              />
            </Field>
            <Field label="Passport expiry">
              <input
                value={form.passportExpiry}
                onChange={(event) =>
                  setForm((value) => ({ ...value, passportExpiry: event.target.value }))
                }
                placeholder="18 Nov 2029"
                className={fieldClass}
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))}
                placeholder="+88017..."
                className={fieldClass}
              />
            </Field>
            <Field label="Email">
              <input
                value={form.email}
                onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
                placeholder="name@email.com"
                className={fieldClass}
              />
            </Field>
            <Field label="Frequent flyer">
              <input
                value={form.frequentFlyer}
                onChange={(event) =>
                  setForm((value) => ({ ...value, frequentFlyer: event.target.value }))
                }
                placeholder="BG 884421"
                className={`${fieldClass} sm:col-span-2`}
              />
            </Field>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="h-11 rounded-xl border border-aerotake-border px-4 text-[13px] font-semibold text-aerotake-navy sm:h-10"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={savePassenger}
              disabled={!form.firstName.trim() || !form.lastName.trim() || !form.passportNo.trim()}
              className="h-11 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white disabled:opacity-40 sm:h-10"
            >
              {editingId ? "Save changes" : "Save passenger"}
            </button>
          </div>
        </Modal>
      ) : null}

      {selected ? (
        <Modal title={passengerName(selected)} onClose={() => setSelected(null)}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                passengerTypeMeta[selected.type].badge
              }`}
            >
              {passengerTypeMeta[selected.type].label}
            </span>
            <span className="text-[12px] text-aerotake-muted">{selected.id}</span>
          </div>
          <div className="mt-4 grid gap-3 rounded-xl bg-[#f8fafc] p-4 text-[13px] sm:grid-cols-2">
            <Meta label="Nationality" value={selected.nationality} />
            <Meta label="Gender" value={selected.gender === "male" ? "Male" : "Female"} />
            <Meta label="Date of birth" value={selected.dateOfBirth} />
            <Meta label="Passport" value={selected.passportNo} />
            <Meta label="Passport expiry" value={selected.passportExpiry} />
            <Meta label="Frequent flyer" value={selected.frequentFlyer ?? "—"} />
            <Meta label="Phone" value={selected.phone || "—"} />
            <Meta label="Email" value={selected.email || "—"} />
            <Meta label="Last used" value={selected.lastUsed} />
            <Meta label="Trips" value={`${selected.trips}`} />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                openEdit(selected);
              }}
              className="h-11 rounded-xl bg-aerotake-coral px-4 text-[13px] font-semibold text-white sm:h-10"
            >
              Edit profile
            </button>
            <button
              type="button"
              onClick={() => removePassenger(selected.id)}
              className="h-11 rounded-xl bg-[#fff1f0] px-4 text-[13px] font-semibold text-aerotake-coral sm:h-10"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="h-11 rounded-xl border border-aerotake-border px-4 text-[13px] font-semibold text-aerotake-navy sm:h-10"
            >
              Close
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

const fieldClass =
  "h-11 w-full rounded-xl border border-aerotake-border bg-white px-3 text-[13px] text-aerotake-navy outline-none focus:border-aerotake-coral";

function PageButton({
  children,
  onClick,
  disabled = false,
  active = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md text-[13px] font-semibold ${
        active
          ? "bg-aerotake-coral text-white"
          : "border border-aerotake-border bg-white text-aerotake-navy hover:bg-aerotake-canvas"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-aerotake-navy/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="min-w-0 text-[16px] font-bold text-aerotake-navy">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-aerotake-muted hover:bg-aerotake-canvas"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-aerotake-navy">{label}</span>
      {children}
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-aerotake-muted uppercase">{label}</p>
      <p className="mt-1 break-words font-medium text-aerotake-navy">{value}</p>
    </div>
  );
}
