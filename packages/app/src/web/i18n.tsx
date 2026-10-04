import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { LABELS, LANGUAGES, type Labels, type Language, systemLanguage } from "./labels.js";

/** The chosen language is a per-browser preference, not workspace knowledge. */
const STORAGE_KEY = "loxora.language";

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
}>({ language: "de", setLanguage: () => undefined });

function storedLanguage(): Language | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.find((language) => language === value) ?? null;
  } catch {
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(
    () => storedLanguage() ?? systemLanguage(navigator.languages ?? [navigator.language]),
  );
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  const setLanguage = (next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Without storage the choice lasts until the page is reloaded.
    }
  };
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useLabels(): Labels {
  return LABELS[useContext(LanguageContext).language];
}
