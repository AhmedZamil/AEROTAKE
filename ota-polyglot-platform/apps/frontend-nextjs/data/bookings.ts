import data from "./bookings.json";

export type BookingTab = "ticket" | "void" | "refund" | "reissue";
export type BookingStatus =
  | "confirmed"
  | "on-hold"
  | "booking-cancelled"
  | "in-progress"
  | "ticket-cancelled"
  | "expired";

export type Booking = {
  id: string;
  tab: BookingTab;
  status: BookingStatus;
  bookedOn: string;
  bookedDate: string;
  airlineCode: string;
  airline: string;
  flightCode: string;
  cabin: string;
  refundable: boolean;
  fromCode: string;
  fromCity: string;
  fromAirport: string;
  toCode: string;
  toCity: string;
  toAirport: string;
  departTime: string;
  arriveTime: string;
  departDate: string;
  arriveDate: string;
  duration: string;
  stops: number;
  pnr: string;
  travelers: string;
  ticketNo: string;
  price: number;
};

export const dummyBookings = data.bookings as Booking[];

export function formatFare(price: number) {
  return `BDT ${price.toLocaleString()}.00`;
}
