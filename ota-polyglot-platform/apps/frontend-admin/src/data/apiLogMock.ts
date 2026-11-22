export type ApiLogItem = {
  id: string;
  partner: string;
  apiType: string;
  apiName: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  statusCode: number;
  responseTime: string;
  requestedAt: string;
};

export const apiLogPartners = [
  "1 - Aerotake Business",
  "2 - SkyLink Travel",
  "3 - Horizon Holidays",
  "4 - Gulf Connect BD",
] as const;

export const apiLogMock: ApiLogItem[] = [
  {
    id: "1",
    partner: "1 - Aerotake Business",
    apiType: "Flight Search",
    apiName: "Search Flights",
    method: "POST",
    endpoint: "/api/v1/flights/search",
    statusCode: 200,
    responseTime: "342ms",
    requestedAt: "13 Sep 2026 10:12",
  },
  {
    id: "2",
    partner: "1 - Aerotake Business",
    apiType: "Booking",
    apiName: "Create Booking",
    method: "POST",
    endpoint: "/api/v1/bookings",
    statusCode: 201,
    responseTime: "518ms",
    requestedAt: "13 Sep 2026 10:08",
  },
  {
    id: "3",
    partner: "1 - Aerotake Business",
    apiType: "Ticketing",
    apiName: "Issue Ticket",
    method: "POST",
    endpoint: "/api/v1/tickets/issue",
    statusCode: 200,
    responseTime: "890ms",
    requestedAt: "13 Sep 2026 09:55",
  },
  {
    id: "4",
    partner: "2 - SkyLink Travel",
    apiType: "Fare Rules",
    apiName: "Get Fare Rules",
    method: "GET",
    endpoint: "/api/v1/fares/rules",
    statusCode: 200,
    responseTime: "210ms",
    requestedAt: "13 Sep 2026 09:40",
  },
  {
    id: "5",
    partner: "1 - Aerotake Business",
    apiType: "Payment",
    apiName: "Confirm Payment",
    method: "POST",
    endpoint: "/api/v1/payments/confirm",
    statusCode: 400,
    responseTime: "156ms",
    requestedAt: "13 Sep 2026 09:22",
  },
  {
    id: "6",
    partner: "3 - Horizon Holidays",
    apiType: "Booking",
    apiName: "Cancel Booking",
    method: "PUT",
    endpoint: "/api/v1/bookings/cancel",
    statusCode: 200,
    responseTime: "402ms",
    requestedAt: "12 Sep 2026 18:14",
  },
  {
    id: "7",
    partner: "1 - Aerotake Business",
    apiType: "Flight Search",
    apiName: "Revalidate Fare",
    method: "POST",
    endpoint: "/api/v1/flights/revalidate",
    statusCode: 500,
    responseTime: "1204ms",
    requestedAt: "12 Sep 2026 17:48",
  },
  {
    id: "8",
    partner: "4 - Gulf Connect BD",
    apiType: "SSR",
    apiName: "Add Extra Baggage",
    method: "POST",
    endpoint: "/api/v1/ssr/baggage",
    statusCode: 200,
    responseTime: "365ms",
    requestedAt: "12 Sep 2026 16:30",
  },
  {
    id: "9",
    partner: "1 - Aerotake Business",
    apiType: "Auth",
    apiName: "Refresh Token",
    method: "POST",
    endpoint: "/api/v1/auth/refresh",
    statusCode: 200,
    responseTime: "98ms",
    requestedAt: "12 Sep 2026 15:05",
  },
  {
    id: "10",
    partner: "2 - SkyLink Travel",
    apiType: "Ticketing",
    apiName: "Void Ticket",
    method: "DELETE",
    endpoint: "/api/v1/tickets/void",
    statusCode: 403,
    responseTime: "187ms",
    requestedAt: "12 Sep 2026 14:41",
  },
];
