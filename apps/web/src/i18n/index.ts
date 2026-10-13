import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import hi from "./hi.json";

// Translations live in JSON so regional languages can be added without code changes.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: localStorage.getItem("g3.lang") ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export const setLanguage = (lng: "en" | "hi") => {
  localStorage.setItem("g3.lang", lng);
  void i18n.changeLanguage(lng);
};

export default i18n;
