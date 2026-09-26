"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from "react";
import { en, type Translations } from "@/locales/en";
import { vi } from "@/locales/vi";

export type Language = "en" | "vi";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: Translations;
}

const LANGUAGE_STORAGE_KEY = "sporthub_lang";
const LANG_CHANGE_EVENT = "sporthub_lang_change";

const dictionaries: Record<Language, Translations> = {
  en,
  vi,
};

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: en,
});

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(LANG_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LANG_CHANGE_EVENT, callback);
  };
}

function getSnapshot(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null;
    if (stored === "vi" || stored === "en") {
      return stored;
    }
  } catch {
    // Ignore localStorage read errors in restricted environments
  }
  return "en";
}

function getServerSnapshot(): Language {
  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Update html lang attribute for accessibility
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
    } catch {
      // Ignore write errors
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    try {
      const current = getSnapshot();
      const next = current === "en" ? "vi" : "en";
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
      window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
    } catch {
      // Ignore
    }
  }, []);

  const t = useMemo(() => {
    return dictionaries[language] || en;
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language, setLanguage, toggleLanguage, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
