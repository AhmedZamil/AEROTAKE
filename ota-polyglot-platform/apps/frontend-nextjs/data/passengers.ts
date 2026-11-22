export type PassengerType = "adult" | "child" | "infant";
export type PassengerGender = "male" | "female";

export type Passenger = {
  id: string;
  title: "Mr" | "Mrs" | "Ms" | "Mstr" | "Miss";
  firstName: string;
  lastName: string;
  type: PassengerType;
  gender: PassengerGender;
  dateOfBirth: string;
  nationality: string;
  passportNo: string;
  passportExpiry: string;
  passportExpiryIso: string;
  phone: string;
  email: string;
  frequentFlyer: string | null;
  lastUsed: string;
  lastUsedIso: string;
  trips: number;
};

export const passengerTypeMeta: Record<PassengerType, { label: string; badge: string }> = {
  adult: { label: "Adult", badge: "bg-[#eff6ff] text-[#2563eb]" },
  child: { label: "Child", badge: "bg-[#fff7ed] text-[#c2410c]" },
  infant: { label: "Infant", badge: "bg-[#f3e8ff] text-[#7c3aed]" },
};

export const dummyPassengers: Passenger[] = [
  {
    id: "PAX-260801",
    title: "Mr",
    firstName: "Rahim",
    lastName: "Uddin",
    type: "adult",
    gender: "male",
    dateOfBirth: "12 Mar 1988",
    nationality: "Bangladesh",
    passportNo: "A01234567",
    passportExpiry: "18 Nov 2029",
    passportExpiryIso: "2029-11-18",
    phone: "+8801711002200",
    email: "rahim.uddin@email.com",
    frequentFlyer: "BG 884421",
    lastUsed: "22 Aug 2026",
    lastUsedIso: "2026-08-22",
    trips: 14,
  },
  {
    id: "PAX-260802",
    title: "Mrs",
    firstName: "Ayesha",
    lastName: "Akter",
    type: "adult",
    gender: "female",
    dateOfBirth: "04 Jul 1992",
    nationality: "Bangladesh",
    passportNo: "A09876543",
    passportExpiry: "02 Feb 2028",
    passportExpiryIso: "2028-02-02",
    phone: "+8801812334455",
    email: "ayesha.akter@email.com",
    frequentFlyer: "BS 220118",
    lastUsed: "21 Aug 2026",
    lastUsedIso: "2026-08-21",
    trips: 9,
  },
  {
    id: "PAX-260803",
    title: "Mstr",
    firstName: "Ayan",
    lastName: "Rahman",
    type: "child",
    gender: "male",
    dateOfBirth: "15 Jan 2018",
    nationality: "Bangladesh",
    passportNo: "C55667788",
    passportExpiry: "09 Sep 2027",
    passportExpiryIso: "2027-09-09",
    phone: "+8801711002200",
    email: "rahim.uddin@email.com",
    frequentFlyer: null,
    lastUsed: "21 Aug 2026",
    lastUsedIso: "2026-08-21",
    trips: 4,
  },
  {
    id: "PAX-260804",
    title: "Miss",
    firstName: "Naira",
    lastName: "Hasan",
    type: "infant",
    gender: "female",
    dateOfBirth: "28 Oct 2025",
    nationality: "Bangladesh",
    passportNo: "I11223344",
    passportExpiry: "28 Oct 2030",
    passportExpiryIso: "2030-10-28",
    phone: "+8801911223344",
    email: "naira.family@email.com",
    frequentFlyer: null,
    lastUsed: "18 Aug 2026",
    lastUsedIso: "2026-08-18",
    trips: 1,
  },
  {
    id: "PAX-260805",
    title: "Mr",
    firstName: "Tanvir",
    lastName: "Hasan",
    type: "adult",
    gender: "male",
    dateOfBirth: "21 Dec 1985",
    nationality: "Bangladesh",
    passportNo: "A33445566",
    passportExpiry: "12 May 2027",
    passportExpiryIso: "2027-05-12",
    phone: "+8801619988776",
    email: "tanvir.hasan@email.com",
    frequentFlyer: "EK 190045",
    lastUsed: "20 Aug 2026",
    lastUsedIso: "2026-08-20",
    trips: 21,
  },
  {
    id: "PAX-260806",
    title: "Ms",
    firstName: "Farzana",
    lastName: "Chowdhury",
    type: "adult",
    gender: "female",
    dateOfBirth: "08 May 1996",
    nationality: "Bangladesh",
    passportNo: "A77889900",
    passportExpiry: "30 Jan 2031",
    passportExpiryIso: "2031-01-30",
    phone: "+8801556677889",
    email: "farzana.chowdhury@email.com",
    frequentFlyer: "QR 667812",
    lastUsed: "19 Aug 2026",
    lastUsedIso: "2026-08-19",
    trips: 7,
  },
  {
    id: "PAX-260807",
    title: "Mr",
    firstName: "Imran",
    lastName: "Kabir",
    type: "adult",
    gender: "male",
    dateOfBirth: "19 Sep 1990",
    nationality: "Bangladesh",
    passportNo: "A44556677",
    passportExpiry: "04 Aug 2026",
    passportExpiryIso: "2026-08-04",
    phone: "+8801777665544",
    email: "imran.kabir@email.com",
    frequentFlyer: null,
    lastUsed: "12 Aug 2026",
    lastUsedIso: "2026-08-12",
    trips: 5,
  },
  {
    id: "PAX-260808",
    title: "Mrs",
    firstName: "Sadia",
    lastName: "Islam",
    type: "adult",
    gender: "female",
    dateOfBirth: "03 Nov 1994",
    nationality: "Bangladesh",
    passportNo: "A22334455",
    passportExpiry: "16 Mar 2030",
    passportExpiryIso: "2030-03-16",
    phone: "+8801888001122",
    email: "sadia.islam@email.com",
    frequentFlyer: "BG 441209",
    lastUsed: "16 Aug 2026",
    lastUsedIso: "2026-08-16",
    trips: 11,
  },
  {
    id: "PAX-260809",
    title: "Mstr",
    firstName: "Rafi",
    lastName: "Kabir",
    type: "child",
    gender: "male",
    dateOfBirth: "22 Jun 2016",
    nationality: "Bangladesh",
    passportNo: "C99887766",
    passportExpiry: "22 Jun 2027",
    passportExpiryIso: "2027-06-22",
    phone: "+8801777665544",
    email: "imran.kabir@email.com",
    frequentFlyer: null,
    lastUsed: "12 Aug 2026",
    lastUsedIso: "2026-08-12",
    trips: 3,
  },
  {
    id: "PAX-260810",
    title: "Mr",
    firstName: "Jamal",
    lastName: "Hossain",
    type: "adult",
    gender: "male",
    dateOfBirth: "27 Apr 1979",
    nationality: "Bangladesh",
    passportNo: "A66778899",
    passportExpiry: "11 Dec 2028",
    passportExpiryIso: "2028-12-11",
    phone: "+8801911003344",
    email: "jamal.hossain@email.com",
    frequentFlyer: "SV 330021",
    lastUsed: "08 Aug 2026",
    lastUsedIso: "2026-08-08",
    trips: 18,
  },
];

export function passengerName(passenger: Passenger) {
  return `${passenger.title} ${passenger.firstName} ${passenger.lastName}`;
}

export function isPassportExpiring(passenger: Passenger, before = "2027-02-24") {
  return passenger.passportExpiryIso <= before;
}
