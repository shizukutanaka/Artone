/**
 * ビルド設定整合性テスト
 *
 * tsconfig.json / vitest.config.ts / package.json / vite.config.ts が
 * 実際のファイル構造と一致していることを自動検証する。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '..');

function readJSON(file: string) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf-8'));
}

describe('tsconfig.json', () => {
  const tsconfig = readJSON('tsconfig.json');

  it('include does not reference src/', () => {
    const includes = tsconfig.include ?? [];
    const srcRefs = includes.filter((p: string) => p.startsWith('src/'));
    expect(srcRefs).toEqual([]);
  });

  it('include covers app/ directory', () => {
    const includes = tsconfig.include ?? [];
    expect(includes.some((p: string) => p.startsWith('app/'))).toBe(true);
  });

  it('paths do not reference src/', () => {
    const paths = tsconfig.compilerOptions?.paths ?? {};
    for (const targets of Object.values(paths)) {
      for (const target of targets as string[]) {
        expect(target).not.toMatch(/^src\//);
      }
    }
  });

  it('strict mode is enabled', () => {
    expect(tsconfig.compilerOptions?.strict).toBe(true);
  });

  it('noUnusedLocals is enabled', () => {
    expect(tsconfig.compilerOptions?.noUnusedLocals).toBe(true);
  });
});

describe('package.json', () => {
  const pkg = readJSON('package.json');

  it('has required fields', () => {
    expect(pkg.name).toBeTruthy();
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.license).toBe('MIT');
    expect(pkg.description).toBeTruthy();
  });

  it('format script does not target src/', () => {
    expect(pkg.scripts?.format).not.toContain(' src');
  });

  it('has test script', () => {
    expect(pkg.scripts?.test).toBeTruthy();
  });

  it('has lint:design script', () => {
    expect(pkg.scripts?.['lint:design']).toBeTruthy();
  });

  it('has typecheck script', () => {
    expect(pkg.scripts?.typecheck).toBeTruthy();
  });
});

describe('vite.config.ts', () => {
  it('does not reference src/workers/render-worker.ts (non-existent)', () => {
    const config = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf-8');
    expect(config).not.toContain('src/workers/render-worker');
  });

  it('does not have src/ alias references', () => {
    const config = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf-8');
    const srcAliasPattern = /resolve\(__dirname,\s*'src\//;
    expect(srcAliasPattern.test(config)).toBe(false);
  });
});

describe('vitest.config.ts', () => {
  it('does not reference src/ in alias', () => {
    const config = fs.readFileSync(path.join(root, 'vitest.config.ts'), 'utf-8');
    expect(config).not.toContain("resolve(__dirname, 'src')");
  });
});

describe('directory structure', () => {
  const coreDirs = [
    'app', 'core', 'render', 'timeline', 'color', 'audio', 'ai',
    'animation', 'captions', 'plugins', 'collab', 'undo', 'scopes',
    'perf', 'recovery', 'media', 'project', 'interchange', 'bench',
    'accessibility', 'security', 'i18n', 'install', 'tests', 'scripts', 'future',
  ];

  it('all core directories exist', () => {
    for (const dir of coreDirs) {
      const p = path.join(root, dir);
      expect(fs.existsSync(p)).toBe(true);
    }
  });

  it('no src/ directory exists', () => {
    expect(fs.existsSync(path.join(root, 'src'))).toBe(false);
  });

  it('all module directories have CLAUDE.md', () => {
    const skipDirs = new Set(['tests', 'scripts', 'future', 'docs', '.git', 'node_modules', 'dist', 'coverage']);
    const missing: string[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;
      const claudeMd = path.join(root, entry.name, 'CLAUDE.md');
      if (!fs.existsSync(claudeMd)) missing.push(entry.name);
    }
    expect(missing).toEqual([]);
  });

  it('app/ contains essential files', () => {
    const essentials = ['main.ts', 'shell.tsx', 'entry.tsx', 'design-system.ts', 'utils.ts', 'logger.ts'];
    for (const f of essentials) {
      expect(fs.existsSync(path.join(root, 'app', f))).toBe(true);
    }
  });

  it('app/ contains error handling files', () => {
    const guards = ['error-boundary.tsx', 'drop-zone.tsx', 'capabilities.ts'];
    for (const f of guards) {
      expect(fs.existsSync(path.join(root, 'app', f))).toBe(true);
    }
  });
});
