import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getTranslation } from '../translations';

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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LANG, language);
    } catch (_) {}
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

  const value = {
    language,
    theme,
    setLanguage,
    setTheme,
    t,
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
