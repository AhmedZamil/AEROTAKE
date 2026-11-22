export type BranchItem = {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  countryName: string;
  address: string;
  timezone: string;
  currency: string;
  lastUpdated: string;
  status: "Active" | "Inactive";
};

export const branchMock: BranchItem[] = [
  {
    id: "1",
    code: "BDHE001",
    name: "Headquarter",
    countryCode: "BD",
    countryName: "Bangladesh",
    address:
      "43, Hatkhola Road, Tikatuli, Chowdhury Mall, Level- 4, Dhaka, Bangladesh, 1203, Dhaka, Dhaka, 1203",
    timezone: "Asia/Dhaka",
    currency: "BDT",
    lastUpdated: "17 May 2026",
    status: "Active",
  },
  {
    id: "2",
    code: "BDCT002",
    name: "Chittagong Branch",
    countryCode: "BD",
    countryName: "Bangladesh",
    address: "Agrabad C/A, World Trade Center, Level-5, Chittagong, 4100",
    timezone: "Asia/Dhaka",
    currency: "BDT",
    lastUpdated: "12 Apr 2026",
    status: "Active",
  },
  {
    id: "3",
    code: "BDGU003",
    name: "Gulshan Branch",
    countryCode: "BD",
    countryName: "Bangladesh",
    address: "Plot 12, Road 53, Gulshan-2, Dhaka, Bangladesh, 1212",
    timezone: "Asia/Dhaka",
    currency: "BDT",
    lastUpdated: "03 Mar 2026",
    status: "Active",
  },
  {
    id: "4",
    code: "BDSY004",
    name: "Sylhet Branch",
    countryCode: "BD",
    countryName: "Bangladesh",
    address: "Zindabazar Main Road, Level-3, Sylhet, Bangladesh, 3100",
    timezone: "Asia/Dhaka",
    currency: "BDT",
    lastUpdated: "28 Feb 2026",
    status: "Inactive",
  },
  {
    id: "5",
    code: "AEDX005",
    name: "Dubai Desk",
    countryCode: "AE",
    countryName: "United Arab Emirates",
    address: "Office 2104, Business Bay Tower, Dubai, UAE",
    timezone: "Asia/Dubai",
    currency: "AED",
    lastUpdated: "09 Jan 2026",
    status: "Active",
  },
  {
    id: "6",
    code: "SASI006",
    name: "Riyadh Office",
    countryCode: "SA",
    countryName: "Saudi Arabia",
    address: "Olaya Street, Kingdom Center, Floor 18, Riyadh, 12211",
    timezone: "Asia/Riyadh",
    currency: "SAR",
    lastUpdated: "21 Dec 2025",
    status: "Active",
  },
];
