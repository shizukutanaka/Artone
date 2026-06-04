/**
 * Artone v3 — React Entry Point
 *
 * 唯一の React root。shell.tsx をマウントする。
 * main.ts (ビジネスロジック) は shell.tsx が内部で使用。
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArtoneShell } from './shell';

const container = document.getElementById('app');
if (!container) throw new Error('Root element #app not found');

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ArtoneShell />
  </React.StrictMode>
);
