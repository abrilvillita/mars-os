/**
 * Internationalization. English is the default. To add a language:
 *   1. copy src/i18n/locales/en.json → <code>.json and translate the values (keep keys)
 *   2. add it to LANGUAGES below
 * Official mission, instrument and dataset names come from the catalog and are never translated.
 * Localized catalog/AI text uses LocalizedText objects ({ en, es, ... }) — see `pickText`.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
] as const;

const STORAGE_KEY = 'marsos.lang';
function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
});
document.documentElement.lang = i18n.language;

/** Resolve a LocalizedText for the current language; `fallback` is true when English was used instead. */
export function pickText(text: Record<string, string> | null | undefined, lng: string): { text: string; fallback: boolean } {
  if (!text) return { text: '', fallback: false };
  if (text[lng]) return { text: text[lng], fallback: false };
  return { text: text.en ?? Object.values(text)[0] ?? '', fallback: lng !== 'en' };
}

export default i18n;
