"use client";

import React, { createContext, useContext, useEffect } from "react";
import { en, type Translations } from "@/locales/en";

// Keep the legacy union until bilingual call sites are simplified. The app always
// supplies English, regardless of language values saved by older releases.
export type Language = "en" | "vi";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
}

const englishContext: LanguageContextType = {
  language: "en",
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: en,
};

const LanguageContext = createContext<LanguageContextType>(englishContext);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = "en";
    try {
      localStorage.removeItem("sporthub_lang");
    } catch {
      // Storage may be unavailable in restricted browser contexts.
    }
  }, []);

  return (
    <LanguageContext.Provider value={englishContext}>
      {children}
    </LanguageContext.Provider>
  );
}

export function getCurrentLanguage(): Language {
  return "en";
}

/** Compatibility wrapper for public authentication routes. */
export function EnglishOnly({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
