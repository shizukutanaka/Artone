#!/usr/bin/env node
/**
 * Artone v3 — Syntax Check
 *
 * 全 .ts/.tsx ファイルを TypeScript パーサーで構文検証する。
 * sed/python 一括置換によるバッククォート欠落・括弧不整合・行連結を検出。
 *
 * design-system-check.sh は文字列パターンしか見ないため、これと併用する。
 *
 * 使い方:
 *   node scripts/syntax-check.mjs
 *
 * TypeScript の解決順:
 *   1. ./node_modules/typescript
 *   2. /tmp/node_modules/typescript (CI 一時インストール)
 *   3. 見つからなければ簡易括弧バランスチェックにフォールバック
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const require = createRequire(import.meta.url);

const SKIP_DIRS = new Set(['node_modules', 'future', '.git', 'dist', 'coverage']);

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectFiles(full));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function loadTypeScript() {
  for (const base of [root, '/tmp']) {
    try {
      const req = createRequire(pathToFileURL(join(base, 'package.json')).href);
      return req('typescript');
    } catch { /* try next */ }
  }
  try { return require('typescript'); } catch { return null; }
}

/** フォールバック: 文字列/コメント/テンプレートを除去した括弧バランス */
function bracketBalance(src) {
  let depth = { '{': 0, '(': 0, '[': 0 };
  let i = 0;
  const n = src.length;
  let state = 'code'; // code | line-comment | block-comment | string | template
  let quote = '';
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line-comment'; i += 2; continue; }
      if (c === '/' && next === '*') { state = 'block-comment'; i += 2; continue; }
      if (c === '"' || c === "'") { state = 'string'; quote = c; i++; continue; }
      if (c === '`') { state = 'template'; i++; continue; }
      if (c === '{' || c === '(' || c === '[') depth[c]++;
      else if (c === '}') depth['{']--;
      else if (c === ')') depth['(']--;
      else if (c === ']') depth['[']--;
    } else if (state === 'line-comment') {
      if (c === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (c === '*' && next === '/') { state = 'code'; i += 2; continue; }
    } else if (state === 'string') {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) state = 'code';
    } else if (state === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') state = 'code';
      // ${ ... } は簡易的に無視 (ネスト未対応だが概算)
    }
    i++;
  }
  return depth;
}

const ts = loadTypeScript();
const files = collectFiles(root);
let errorCount = 0;
const errorFiles = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);

  if (ts) {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const diags = sf.parseDiagnostics || [];
    if (diags.length > 0) {
      errorFiles.push(rel);
      for (const d of diags.slice(0, 3)) {
        const lc = sf.getLineAndCharacterOfPosition(d.start);
        const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
        console.error(`  ${rel}:${lc.line + 1}:${lc.character + 1} ${msg}`);
        errorCount++;
      }
    }
  } else {
    // フォールバック: 括弧バランス
    const bal = bracketBalance(src);
    if (bal['{'] !== 0 || bal['('] !== 0 || bal['['] !== 0) {
      errorFiles.push(rel);
      console.error(`  ${rel}: bracket imbalance {${bal['{']} (${bal['(']} [${bal['[']}`);
      errorCount++;
    }
  }
}

console.log('');
if (errorCount > 0) {
  console.error(`SYNTAX CHECK FAILED: ${errorCount} error(s) in ${errorFiles.length} file(s)`);
  console.error(`Method: ${ts ? 'TypeScript parser' : 'bracket-balance fallback'}`);
  process.exit(1);
} else {
  console.log(`SYNTAX CHECK PASSED: ${files.length} files (${ts ? 'TypeScript parser' : 'bracket-balance fallback'})`);
  process.exit(0);
}
