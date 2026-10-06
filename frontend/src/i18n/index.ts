import { tr } from "./tr.ts";
import { en } from "./en.ts";
import { aliases } from "./aliases.ts";
export type Locale = "tr" | "en";
export type MessageKey = keyof typeof tr;
let locale: Locale = "tr";
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export const subscribeLocale = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setLocale(value: Locale) {
  locale = value;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("zeminai.locale", value);
    } catch {}
    document.documentElement.lang = value;
  }
  listeners.forEach((listener) => listener());
}
export function restoreLocale(storage: Pick<Storage, "getItem">): Locale {
  try {
    return storage.getItem("zeminai.locale") === "en" ? "en" : "tr";
  } catch {
    return "tr";
  }
}
export function t(key: MessageKey, lang: Locale = getLocale()): string {
  return (lang === "en" ? en : tr)[key];
}
// Only static copy and known backend labels may use tx. Never pass user-generated text.
export function tx(value: string | number): string {
  const text = String(value),
    key = aliases[text];
  if (text in tr) return t(text as MessageKey);
  if (key) return t(key as MessageKey);
  const reverse = Object.keys(en).find(
    (k) => en[k as MessageKey] === text || tr[k as MessageKey] === text,
  );
  return reverse ? t(reverse as MessageKey) : text;
}
export function localized<T extends object>(value: T): T {
  return new Proxy(value, {
    get(target, key, receiver) {
      const item = Reflect.get(target, key, receiver);
      return typeof item === "string"
        ? tx(item)
        : item && typeof item === "object"
          ? localized(item)
          : item;
    },
  });
}
export function formatDate(value: string, monthOnly = false): string {
  const date = new Date(
    value.length === 7
      ? value + "-01T12:00:00Z"
      : value.length === 10
        ? value + "T12:00:00Z"
        : value,
  );
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(getLocale() === "tr" ? "tr-TR" : "en-GB", {
        year: "numeric",
        month: "short",
        ...(monthOnly ? {} : { day: "numeric" }),
        timeZone: "UTC",
      }).format(date);
}

export function interpolate(
  key: MessageKey,
  values: Record<string, string | number>,
): string {
  return t(key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}
