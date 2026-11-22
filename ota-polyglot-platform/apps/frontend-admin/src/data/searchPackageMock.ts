export type SearchPackageItem = {
  id: string;
  name: string;
  code: string;
  type: "Basic" | "Standard" | "Premium" | "Unlimited";
  monthlySearchLimit: string;
  price: string;
  currency: string;
  status: "Active" | "Inactive";
};

export const searchPackageMock: SearchPackageItem[] = [
  {
    id: "1",
    name: "Starter Search",
    code: "PKG-BASIC",
    type: "Basic",
    monthlySearchLimit: "1,000",
    price: "2,500",
    currency: "BDT",
    status: "Active",
  },
  {
    id: "2",
    name: "Growth Search",
    code: "PKG-STD",
    type: "Standard",
    monthlySearchLimit: "5,000",
    price: "7,500",
    currency: "BDT",
    status: "Active",
  },
  {
    id: "3",
    name: "Pro Search",
    code: "PKG-PREM",
    type: "Premium",
    monthlySearchLimit: "20,000",
    price: "18,000",
    currency: "BDT",
    status: "Active",
  },
  {
    id: "4",
    name: "Enterprise Search",
    code: "PKG-UNLIM",
    type: "Unlimited",
    monthlySearchLimit: "Unlimited",
    price: "45,000",
    currency: "BDT",
    status: "Active",
  },
  {
    id: "5",
    name: "Trial Search",
    code: "PKG-TRIAL",
    type: "Basic",
    monthlySearchLimit: "200",
    price: "0",
    currency: "BDT",
    status: "Inactive",
  },
  {
    id: "6",
    name: "Partner Plus",
    code: "PKG-PLUS",
    type: "Standard",
    monthlySearchLimit: "10,000",
    price: "12,000",
    currency: "BDT",
    status: "Active",
  },
];
