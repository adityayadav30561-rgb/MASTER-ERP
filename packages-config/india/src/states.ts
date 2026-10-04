/**
 * GST state codes (first two digits of a GSTIN) and ISO 3166-2:IN subdivision codes.
 * ISO codes follow the 2020 revision that aligned several codes with vehicle registration codes
 * (IN-CG, IN-DH, IN-OD, IN-TS, IN-UK). To be re-verified against the ISO Online Browsing Platform before go-live.
 */
export interface IndianState {
  gstCode: string;
  iso: string;
  name: string;
}

export const STATES: readonly IndianState[] = [
  { gstCode: "01", iso: "IN-JK", name: "Jammu and Kashmir" },
  { gstCode: "02", iso: "IN-HP", name: "Himachal Pradesh" },
  { gstCode: "03", iso: "IN-PB", name: "Punjab" },
  { gstCode: "04", iso: "IN-CH", name: "Chandigarh" },
  { gstCode: "05", iso: "IN-UK", name: "Uttarakhand" },
  { gstCode: "06", iso: "IN-HR", name: "Haryana" },
  { gstCode: "07", iso: "IN-DL", name: "Delhi" },
  { gstCode: "08", iso: "IN-RJ", name: "Rajasthan" },
  { gstCode: "09", iso: "IN-UP", name: "Uttar Pradesh" },
  { gstCode: "10", iso: "IN-BR", name: "Bihar" },
  { gstCode: "11", iso: "IN-SK", name: "Sikkim" },
  { gstCode: "12", iso: "IN-AR", name: "Arunachal Pradesh" },
  { gstCode: "13", iso: "IN-NL", name: "Nagaland" },
  { gstCode: "14", iso: "IN-MN", name: "Manipur" },
  { gstCode: "15", iso: "IN-MZ", name: "Mizoram" },
  { gstCode: "16", iso: "IN-TR", name: "Tripura" },
  { gstCode: "17", iso: "IN-ML", name: "Meghalaya" },
  { gstCode: "18", iso: "IN-AS", name: "Assam" },
  { gstCode: "19", iso: "IN-WB", name: "West Bengal" },
  { gstCode: "20", iso: "IN-JH", name: "Jharkhand" },
  { gstCode: "21", iso: "IN-OD", name: "Odisha" },
  { gstCode: "22", iso: "IN-CG", name: "Chhattisgarh" },
  { gstCode: "23", iso: "IN-MP", name: "Madhya Pradesh" },
  { gstCode: "24", iso: "IN-GJ", name: "Gujarat" },
  { gstCode: "26", iso: "IN-DH", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { gstCode: "27", iso: "IN-MH", name: "Maharashtra" },
  { gstCode: "29", iso: "IN-KA", name: "Karnataka" },
  { gstCode: "30", iso: "IN-GA", name: "Goa" },
  { gstCode: "31", iso: "IN-LD", name: "Lakshadweep" },
  { gstCode: "32", iso: "IN-KL", name: "Kerala" },
  { gstCode: "33", iso: "IN-TN", name: "Tamil Nadu" },
  { gstCode: "34", iso: "IN-PY", name: "Puducherry" },
  { gstCode: "35", iso: "IN-AN", name: "Andaman and Nicobar Islands" },
  { gstCode: "36", iso: "IN-TS", name: "Telangana" },
  { gstCode: "37", iso: "IN-AP", name: "Andhra Pradesh" },
  { gstCode: "38", iso: "IN-LA", name: "Ladakh" },
];

/** Older ISO codes people still type; we ask for the current one instead of guessing. */
export const FORMER_ISO: Readonly<Record<string, string>> = { "IN-CT": "IN-CG", "IN-TG": "IN-TS", "IN-UT": "IN-UK", "IN-OR": "IN-OD", "IN-DD": "IN-DH", "IN-DN": "IN-DH" };

/** Special GSTIN state codes without an address region (Other Territory, Centre Jurisdiction). */
export const SPECIAL_GST_CODES = new Set(["97", "99"]);

export const stateByGstCode = new Map(STATES.map((s) => [s.gstCode, s]));
export const stateByIso = new Map(STATES.map((s) => [s.iso, s]));
