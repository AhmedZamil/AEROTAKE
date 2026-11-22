export type PartnerInfoItem = {
  id: string;
  partner: string;
  partnerType: "B2B" | "B2C" | "Reseller" | "Agent";
  serviceType: string;
  entryBy: string;
  lastUpdated: string;
};

export const partnerInfoMock: PartnerInfoItem[] = [
  {
    id: "1",
    partner: "SkyLink Travel",
    partnerType: "B2B",
    serviceType: "Flight Booking",
    entryBy: "Admin",
    lastUpdated: "12 Jan 2026",
  },
  {
    id: "2",
    partner: "Horizon Holidays",
    partnerType: "B2B",
    serviceType: "Flight + Hotel",
    entryBy: "Anamul Haque",
    lastUpdated: "18 Jan 2026",
  },
  {
    id: "3",
    partner: "Gulf Connect BD",
    partnerType: "Reseller",
    serviceType: "Umrah Package",
    entryBy: "Admin",
    lastUpdated: "22 Jan 2026",
  },
  {
    id: "4",
    partner: "Dhaka Air Desk",
    partnerType: "Agent",
    serviceType: "Domestic Flight",
    entryBy: "Riad Ahmed",
    lastUpdated: "28 Jan 2026",
  },
  {
    id: "5",
    partner: "BlueWing Agency",
    partnerType: "B2C",
    serviceType: "Flight Booking",
    entryBy: "Admin",
    lastUpdated: "02 Feb 2026",
  },
  {
    id: "6",
    partner: "TravelPoint BD",
    partnerType: "B2B",
    serviceType: "Group Booking",
    entryBy: "Anamul Haque",
    lastUpdated: "08 Feb 2026",
  },
  {
    id: "7",
    partner: "Pearl Voyage",
    partnerType: "Reseller",
    serviceType: "International Flight",
    entryBy: "Admin",
    lastUpdated: "14 Feb 2026",
  },
  {
    id: "8",
    partner: "AeroNest Tours",
    partnerType: "Agent",
    serviceType: "Flight Booking",
    entryBy: "Riad Ahmed",
    lastUpdated: "20 Feb 2026",
  },
];
