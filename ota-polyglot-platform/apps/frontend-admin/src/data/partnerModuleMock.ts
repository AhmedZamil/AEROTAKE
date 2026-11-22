export type PartnerModuleItem = {
  id: string;
  apiType: string;
  entryBy: string;
  entryAt: string;
  lastUpdated: string;
  status: "Active" | "Inactive";
};

export const partnerModuleMock: PartnerModuleItem[] = [
  {
    id: "1",
    apiType: "Tripadvisor",
    entryBy: "NSN",
    entryAt: "16-Apr-2025 06:31",
    lastUpdated: "17-Feb-2026 08:02",
    status: "Active",
  },
  {
    id: "2",
    apiType: "Amadeus GDS",
    entryBy: "Admin",
    entryAt: "10-Jan-2025 11:20",
    lastUpdated: "12-Feb-2026 14:45",
    status: "Active",
  },
  {
    id: "3",
    apiType: "Sabre",
    entryBy: "Anamul",
    entryAt: "22-Mar-2025 09:15",
    lastUpdated: "05-Feb-2026 10:18",
    status: "Active",
  },
  {
    id: "4",
    apiType: "Galileo",
    entryBy: "NSN",
    entryAt: "08-May-2025 16:40",
    lastUpdated: "28-Jan-2026 19:22",
    status: "Inactive",
  },
  {
    id: "5",
    apiType: "Flydubai NDC",
    entryBy: "Riad",
    entryAt: "14-Jun-2025 08:05",
    lastUpdated: "20-Feb-2026 07:50",
    status: "Active",
  },
  {
    id: "6",
    apiType: "Emirates NDC",
    entryBy: "Admin",
    entryAt: "01-Jul-2025 13:30",
    lastUpdated: "15-Feb-2026 11:12",
    status: "Active",
  },
  {
    id: "7",
    apiType: "Hotelbeds",
    entryBy: "Anamul",
    entryAt: "19-Aug-2025 10:55",
    lastUpdated: "02-Feb-2026 16:33",
    status: "Inactive",
  },
  {
    id: "8",
    apiType: "Payment Gateway",
    entryBy: "NSN",
    entryAt: "03-Sep-2025 07:18",
    lastUpdated: "18-Feb-2026 09:40",
    status: "Active",
  },
];
