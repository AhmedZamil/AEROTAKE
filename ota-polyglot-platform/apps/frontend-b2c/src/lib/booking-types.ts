/** A booking as core-engine shows it to the person who made it: the narrow view — itinerary, travellers' names, the total, when it lapses.
 *  Never a document number, supplier reference, cost or margin. */
export type BookingItinerarySegment = {
  airlineCode: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  departureTimeLocal: string;
  arrivalTimeLocal: string;
  legIndex: number;
};

export type BookingView = {
  id: string;
  reference: string;
  status: string;
  total: number;
  currency: string;
  ticketingDeadline: string | null;
  createdAt: string;
  travelers: { firstName: string; lastName: string }[];
  itinerary: BookingItinerarySegment[] | null;
  checkedBaggageIncluded: boolean;
  checkedBaggageWeightKg: number;
  /** P5-20: core says cancel/request is allowed right now. */
  canRequestCancel?: boolean;
  cancelBlockedReason?: string | null;
  cancelRequestStatus?: string | null;
};
