import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { api, post } from "./api.js";
import {
  LABELS,
  LANGUAGES,
  type Labels,
  type Language,
  startLanguage,
  systemLanguage,
} from "./labels.js";

/**
 * The chosen language is a per-user setting, not workspace knowledge. It lives in the app
 * settings file (Milestone 13); browser storage, used before, is imported once and kept as a
 * fallback when the settings file is unavailable.
 */
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

function system(): Language {
  return systemLanguage(navigator.languages ?? [navigator.language]);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => storedLanguage() ?? system());
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    let active = true;
    api<{ available: boolean; language: Language | null }>("/api/settings")
      .then((settings) => {
        if (!active) return;
        const start = startLanguage(settings, storedLanguage(), system());
        setLanguageState(start.language);
        if (start.importBrowserChoice) {
          void post("/api/settings/language", { language: start.language }).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const setLanguage = (next: Language) => {
    setLanguageState(next);
    void post("/api/settings/language", { language: next }).catch(() => undefined);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The settings file holds the choice; browser storage is only a fallback.
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
