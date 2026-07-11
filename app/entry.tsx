/**
 * Artone v3 — React Entry Point
 *
 * 唯一の React root。shell.tsx をマウントする。
 * main.ts (ビジネスロジック) は shell.tsx が内部で使用。
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { setupI18n } from '../i18n/i18n-manager';
import { createLogger } from './logger';
import { AppRoot } from './shell';

const log = createLogger('Entry');

const container = document.getElementById('app');
if (!container) throw new Error('Root element #app not found');

// t() throws until this runs (see i18n/i18n-manager.ts), so it must complete
// before any component renders. A failed locale fetch still resolves: t()
// falls back to returning the raw key rather than throwing.
setupI18n({
  defaultLocale: 'ja',
  fallbackLocale: 'en',
  loadPath: '/i18n/{locale}.json',
})
  .init()
  .catch((err: Error) => {
    log.error('locale load failed, falling back to translation keys', err);
  })
  .finally(() => {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <AppRoot />
      </React.StrictMode>
    );
  });
