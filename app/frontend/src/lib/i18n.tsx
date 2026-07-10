import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

const STORAGE = "penumbra.lang";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
];

interface I18n {
  t: (key: string) => string;
  lang: string;
  setLang: (lang: string) => void;
}

const Ctx = createContext<I18n>({ t: (k) => k, lang: "en", setLang: () => {} });

/**
 * Loads the UI string bundle from the engine (`/api/i18n`, Java ResourceBundle)
 * and exposes `t(key)`. Retries while the engine boots — the splash screen
 * covers that window, so keys never flash to the user.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(
    () => localStorage.getItem(STORAGE) ?? (navigator.language.startsWith("pt") ? "pt" : "en"),
  );
  const [msgs, setMsgs] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const load = () =>
      api
        .i18n(lang)
        .then((m) => alive && setMsgs(m))
        .catch(() => {
          timer = window.setTimeout(load, 2000);
        });
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [lang]);

  const setLang = (l: string) => {
    localStorage.setItem(STORAGE, l);
    setLangState(l);
  };

  return (
    <Ctx.Provider value={{ t: (key) => msgs[key] ?? key, lang, setLang }}>{children}</Ctx.Provider>
  );
}

export const useT = () => useContext(Ctx);
