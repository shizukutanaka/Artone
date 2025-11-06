/**
 * React hook for internationalization
 * Integrates with the existing InternationalizationManager
 */

import { useState, useEffect, useCallback } from 'react';

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  rtl: boolean;
}

export interface TranslationStats {
  currentLanguage: string;
  keysTranslated: number;
  totalKeys: number;
  completeness: number;
  loadedLanguages: string[];
  supportedLanguages: number;
}

export function useI18n() {
  const [currentLanguage, setCurrentLanguage] = useState<string>('en-US');
  const [isLoading, setIsLoading] = useState(false);
  const [supportedLanguages, setSupportedLanguages] = useState<LanguageInfo[]>([]);
  const [stats, setStats] = useState<TranslationStats | null>(null);

  useEffect(() => {
    // Initialize i18n manager
    const initializeI18n = async () => {
      if (typeof window === 'undefined') return;

      try {
        // Import the existing InternationalizationManager
        const { InternationalizationManager } = await import('../i18n/InternationalizationManager');
        const i18nManager = new InternationalizationManager({
          defaultLanguage: 'en-US',
          fallbackLanguage: 'en',
          autoDetect: true,
          persistSelection: true
        });

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 100));

        setSupportedLanguages(i18nManager.getSupportedLanguages());
        setStats(i18nManager.getTranslationStats());

        // Set up observer for language changes
        i18nManager.addObserver((data) => {
          setCurrentLanguage(data.newLanguage);
          setStats(i18nManager.getTranslationStats());
        });

        // Store manager globally for components to use
        (window as any).artoneI18n = i18nManager;

      } catch (error) {
        console.error('Failed to initialize i18n:', error);
      }
    };

    initializeI18n();
  }, []);

  const t = useCallback((key: string, params?: Record<string, any>) => {
    if (typeof window === 'undefined' || !(window as any).artoneI18n) {
      return key; // Fallback for SSR
    }

    return (window as any).artoneI18n.t(key, params);
  }, []);

  const setLanguage = useCallback(async (languageCode: string) => {
    if (typeof window === 'undefined' || !(window as any).artoneI18n) return;

    setIsLoading(true);
    try {
      await (window as any).artoneI18n.setLanguage(languageCode);
    } catch (error) {
      console.error('Failed to set language:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const formatNumber = useCallback((number: number, type?: string) => {
    if (typeof window === 'undefined' || !(window as any).artoneI18n) {
      return number.toString();
    }

    return (window as any).artoneI18n.formatNumber(number, type);
  }, []);

  const formatDate = useCallback((date: Date, type?: string) => {
    if (typeof window === 'undefined' || !(window as any).artoneI18n) {
      return date.toLocaleDateString();
    }

    return (window as any).artoneI18n.formatDate(date, type);
  }, []);

  const formatRelativeTime = useCallback((value: number, unit: string) => {
    if (typeof window === 'undefined' || !(window as any).artoneI18n) {
      return `${value} ${unit}s ago`;
    }

    return (window as any).artoneI18n.formatRelativeTime(value, unit);
  }, []);

  const formatList = useCallback((items: string[]) => {
    if (typeof window === 'undefined' || !(window as any).artoneI18n) {
      return items.join(', ');
    }

    return (window as any).artoneI18n.formatList(items);
  }, []);

  return {
    t,
    setLanguage,
    currentLanguage,
    supportedLanguages,
    isLoading,
    stats,
    formatNumber,
    formatDate,
    formatRelativeTime,
    formatList
  };
}
