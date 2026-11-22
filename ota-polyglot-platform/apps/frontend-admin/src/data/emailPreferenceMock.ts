export type EmailPreferenceItem = {
  id: string;
  partner: string;
  subject: string;
  serviceType: string;
  emailFor: string;
  attachedPdf: "Yes" | "No";
  customerCopy: "Yes" | "No";
  status: "Active" | "Inactive";
  updatedAt: string;
};

export const emailPreferencePartners = [
  "1 - Aerotake Business",
  "2 - SkyLink Travel",
  "3 - Horizon Holidays",
  "4 - Gulf Connect BD",
] as const;

export const emailPreferenceMock: EmailPreferenceItem[] = [
  {
    id: "1",
    partner: "1 - Aerotake Business",
    subject: "Ticket Confirmation Email",
    serviceType: "Booking Confirmation",
    emailFor: "Customer",
    attachedPdf: "Yes",
    customerCopy: "Yes",
    status: "Active",
    updatedAt: "12 Jan 2026",
  },
  {
    id: "2",
    partner: "1 - Aerotake Business",
    subject: "Payment Receipt Notification",
    serviceType: "Payment",
    emailFor: "Partner",
    attachedPdf: "Yes",
    customerCopy: "No",
    status: "Active",
    updatedAt: "18 Jan 2026",
  },
  {
    id: "3",
    partner: "2 - SkyLink Travel",
    subject: "Flight Schedule Change Alert",
    serviceType: "Schedule Change",
    emailFor: "Customer",
    attachedPdf: "No",
    customerCopy: "Yes",
    status: "Active",
    updatedAt: "22 Jan 2026",
  },
  {
    id: "4",
    partner: "3 - Horizon Holidays",
    subject: "Void/Refund Status Update",
    serviceType: "Void/Refund",
    emailFor: "Admin",
    attachedPdf: "Yes",
    customerCopy: "No",
    status: "Inactive",
    updatedAt: "28 Jan 2026",
  },
  {
    id: "5",
    partner: "1 - Aerotake Business",
    subject: "Invoice Generated Alert",
    serviceType: "Invoice",
    emailFor: "Partner",
    attachedPdf: "Yes",
    customerCopy: "Yes",
    status: "Active",
    updatedAt: "02 Feb 2026",
  },
  {
    id: "6",
    partner: "4 - Gulf Connect BD",
    subject: "Booking Cancellation Notice",
    serviceType: "Cancellation",
    emailFor: "Customer",
    attachedPdf: "No",
    customerCopy: "Yes",
    status: "Active",
    updatedAt: "08 Feb 2026",
  },
  {
    id: "7",
    partner: "2 - SkyLink Travel",
    subject: "Top-Up Request Confirmation",
    serviceType: "Finance",
    emailFor: "Partner",
    attachedPdf: "No",
    customerCopy: "No",
    status: "Inactive",
    updatedAt: "14 Feb 2026",
  },
  {
    id: "8",
    partner: "1 - Aerotake Business",
    subject: "Daily Sales Summary",
    serviceType: "Report",
    emailFor: "Admin",
    attachedPdf: "Yes",
    customerCopy: "No",
    status: "Active",
    updatedAt: "20 Feb 2026",
  },
];
