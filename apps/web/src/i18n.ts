/** Languages (ADR-0056: i18next). English first; Hindi for the shop floor. Industry terms come from packages. */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const en = {
  nav: { home: "Home", parties: "Parties", items: "Items", import: "Import from Excel", admin: "Administration", users: "People and roles", roles: "Roles", org: "Organisation", devices: "Shop-floor tablets", settings: "Settings", numbering: "Numbering", checklist: "Getting started" },
  common: { save: "Save", cancel: "Cancel", search: "Search", loadMore: "Load more", new: "New", edit: "Edit", back: "Back", signOut: "Sign out", loading: "Loading…", none: "Nothing here yet" },
  login: { title: "Sign in", email: "E-mail", password: "Password", submit: "Sign in", code: "6-digit code from your authenticator app", verify: "Verify", tablet: "Shop-floor tablet sign-in" },
  device: { title: "Tablet sign-in", employeeCode: "Employee code", pin: "PIN", setup: "Set up this tablet", token: "Device code from the administrator" },
};

const hi: typeof en = {
  nav: { home: "होम", parties: "पार्टियाँ", items: "आइटम", import: "एक्सेल से आयात", admin: "प्रशासन", users: "लोग और भूमिकाएँ", roles: "भूमिकाएँ", org: "संगठन", devices: "शॉप-फ़्लोर टैबलेट", settings: "सेटिंग्स", numbering: "नंबरिंग", checklist: "शुरुआत" },
  common: { save: "सहेजें", cancel: "रद्द करें", search: "खोजें", loadMore: "और देखें", new: "नया", edit: "बदलें", back: "वापस", signOut: "साइन आउट", loading: "लोड हो रहा है…", none: "अभी कुछ नहीं" },
  login: { title: "साइन इन", email: "ई-मेल", password: "पासवर्ड", submit: "साइन इन", code: "ऑथेंटिकेटर ऐप का 6 अंकों का कोड", verify: "जाँचें", tablet: "शॉप-फ़्लोर टैबलेट साइन इन" },
  device: { title: "टैबलेट साइन इन", employeeCode: "कर्मचारी कोड", pin: "पिन", setup: "यह टैबलेट सेट करें", token: "प्रशासक से मिला डिवाइस कोड" },
};

function initialLanguage(): string {
  try {
    return localStorage.getItem("erp.lang") ?? "en";
  } catch {
    return "en";
  }
}

void i18n.use(initReactI18next).init({ resources: { en: { translation: en }, hi: { translation: hi } }, lng: initialLanguage(), fallbackLng: "en", interpolation: { escapeValue: false } });

export function setLanguage(lang: "en" | "hi"): void {
  localStorage.setItem("erp.lang", lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
