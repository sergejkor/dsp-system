import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getTranslation } from '../translations';
import {
  formatPortalCurrency,
  formatPortalDate,
  formatPortalDateTime,
  formatPortalNumber,
  formatPortalTime,
  resolvePortalDocumentLanguage,
  resolvePortalLocale,
} from '../utils/portalLocale.js';
import { applyLegacyUiLocalization } from '../utils/legacyUiLocalization.js';

const STORAGE_LANG = 'app_lang';
const STORAGE_THEME = 'app_theme';

function readLang() {
  try {
    const v = localStorage.getItem(STORAGE_LANG);
    return v === 'de' ? 'de' : 'en';
  } catch (_) {
    return 'en';
  }
}

function readTheme() {
  try {
    const v = localStorage.getItem(STORAGE_THEME);
    return v === 'dark' ? 'dark' : 'light';
  } catch (_) {
    return 'light';
  }
}

const AppSettingsContext = createContext(null);

export function AppSettingsProvider({ children }) {
  const [language, setLanguageState] = useState(readLang);
  const [theme, setThemeState] = useState(readTheme);
  const locale = resolvePortalLocale(language);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LANG, language);
    } catch (_) {}
    const documentLanguage = resolvePortalDocumentLanguage(language);
    document.documentElement.lang = documentLanguage;
    document.documentElement.setAttribute('data-language', documentLanguage);
    document.body?.setAttribute('lang', documentLanguage);

    const applyInputLanguage = () => {
      document
        .querySelectorAll('input[type="date"], input[type="month"], input[type="datetime-local"], input[type="time"]')
        .forEach((element) => {
          element.setAttribute('lang', documentLanguage);
        });
    };

    applyInputLanguage();
    applyLegacyUiLocalization(document.body, language);

    const observer = new MutationObserver(() => {
      applyInputLanguage();
      applyLegacyUiLocalization(document.body, language);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label', 'value'],
    });

    return () => observer.disconnect();
  }, [language]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_THEME, theme);
    } catch (_) {}
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang === 'de' ? 'de' : 'en');
  }, []);

  const setTheme = useCallback((t) => {
    setThemeState(t === 'dark' ? 'dark' : 'light');
  }, []);

  const t = useCallback(
    (keyPath) => getTranslation(language, keyPath),
    [language]
  );

  const formatDate = useCallback((value, options) => formatPortalDate(value, language, options), [language]);
  const formatDateTime = useCallback((value, options) => formatPortalDateTime(value, language, options), [language]);
  const formatTime = useCallback((value, options) => formatPortalTime(value, language, options), [language]);
  const formatNumber = useCallback((value, options) => formatPortalNumber(value, language, options), [language]);
  const formatCurrency = useCallback((value, currency, options) => formatPortalCurrency(value, language, currency, options), [language]);

  const value = {
    language,
    locale,
    theme,
    setLanguage,
    setTheme,
    t,
    formatDate,
    formatDateTime,
    formatTime,
    formatNumber,
    formatCurrency,
    isDark: theme === 'dark',
  };

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used within AppSettingsProvider');
  return ctx;
}
