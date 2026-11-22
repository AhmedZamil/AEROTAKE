export type PartnerRequestItem = {
  id: string;
  enrollmentCode: string;
  legalName: string;
  email: string;
  contact: string;
  branch: string;
  status: "Request" | "Approved" | "Rejected" | "Under Review";
  requestedAt: string;
};

export const partnerRequestMock: PartnerRequestItem[] = [
  {
    id: "1",
    enrollmentCode: "ENR-98234",
    legalName: "Acme Travel Ltd",
    email: "contact@acmetravel.com",
    contact: "+8801713003001",
    branch: "Dhaka Main",
    status: "Request",
    requestedAt: "12 Jan 2026",
  },
  {
    id: "2",
    enrollmentCode: "ENR-98251",
    legalName: "Global Solutions BD",
    email: "hello@globalsolutions.com",
    contact: "+8801713003002",
    branch: "Chittagong",
    status: "Under Review",
    requestedAt: "18 Jan 2026",
  },
  {
    id: "3",
    enrollmentCode: "ENR-98277",
    legalName: "Sunrise Holidays",
    email: "ops@sunriseholidays.com",
    contact: "+8801713003003",
    branch: "Dhaka Gulshan",
    status: "Approved",
    requestedAt: "22 Jan 2026",
  },
  {
    id: "4",
    enrollmentCode: "ENR-98301",
    legalName: "Pearl Voyage Agency",
    email: "info@pearlvoyage.com",
    contact: "+8801713003004",
    branch: "Sylhet",
    status: "Rejected",
    requestedAt: "28 Jan 2026",
  },
  {
    id: "5",
    enrollmentCode: "ENR-98320",
    legalName: "CityJet Partners",
    email: "admin@cityjet.com",
    contact: "+8801713003005",
    branch: "Motijheel",
    status: "Request",
    requestedAt: "02 Feb 2026",
  },
  {
    id: "6",
    enrollmentCode: "ENR-98344",
    legalName: "Nomad Tours BD",
    email: "team@nomadtours.com",
    contact: "+8801713003006",
    branch: "Khulna",
    status: "Under Review",
    requestedAt: "08 Feb 2026",
  },
  {
    id: "7",
    enrollmentCode: "ENR-98368",
    legalName: "Blue Horizon Travel",
    email: "support@bluehorizon.com",
    contact: "+8801713003007",
    branch: "Rajshahi",
    status: "Approved",
    requestedAt: "14 Feb 2026",
  },
  {
    id: "8",
    enrollmentCode: "ENR-98390",
    legalName: "AeroNest Agency",
    email: "enroll@aeronest.com",
    contact: "+8801713003008",
    branch: "Dhaka Main",
    status: "Request",
    requestedAt: "20 Feb 2026",
  },
];
