export type PartnerProfile = {
  agencyName: string;
  agencyId: string;
  contactName: string;
  email: string;
  mobile: string;
  officeContact: string;
  address: string;
  country: string;
  state: string;
  city: string;
  district: string;
  tradeLicense: string;
  civilAviation: string;
  membership: string;
  agencyType: string;
  avatarUrl: string | null;
};

export type PartnerAccount = {
  loginEmail: string;
  phone: string;
  timezone: string;
  language: string;
  emailAlerts: boolean;
  smsAlerts: boolean;
  marketingEmails: boolean;
};

export const defaultPartnerProfile: PartnerProfile = {
  agencyName: "AeroTake Aviation",
  agencyId: "ATK-0245",
  contactName: "Riad Hossain",
  email: "partner@aerotake.com",
  mobile: "+880 1712-345678",
  officeContact: "+880 2-55001234",
  address: "House 12, Road 5, Banani, Dhaka",
  country: "Bangladesh",
  state: "Dhaka",
  city: "Dhaka",
  district: "Dhaka",
  tradeLicense: "TL-48291035",
  civilAviation: "CAAB-229184",
  membership: "ATAB-11842",
  agencyType: "Retail",
  avatarUrl: null,
};

export const defaultPartnerAccount: PartnerAccount = {
  loginEmail: "partner@aerotake.com",
  phone: "+880 1712-345678",
  timezone: "Asia/Dhaka (GMT+6)",
  language: "English",
  emailAlerts: true,
  smsAlerts: true,
  marketingEmails: false,
};
