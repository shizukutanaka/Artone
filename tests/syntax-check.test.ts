/**
 * Syntax Check スクリプトのテスト
 *
 * 構文チェッカーが破損コードを検出し、正常コードを通すことを検証。
 * これは「CI が構文破壊を見逃さない」という前回の教訓を守るための回帰テスト。
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const script = join(root, 'scripts', 'syntax-check.mjs');

function runSyntaxCheck(): { code: number; output: string } {
  try {
    const output = execFileSync('node', [script], { cwd: root, encoding: 'utf8' });
    return { code: 0, output };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, output: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

describe('syntax-check.mjs', () => {
  it('passes on the current clean codebase', () => {
    const result = runSyntaxCheck();
    expect(result.code).toBe(0);
    expect(result.output).toContain('SYNTAX CHECK PASSED');
  });

  it('detects a broken file with missing backtick', () => {
    // 前回のバグ (log.warn(text ${x}`) を再現
    const brokenPath = join(root, 'app', '_syntax_test_tmp.ts');
    writeFileSync(brokenPath, 'const x = foo(`missing ${y});\n');
    try {
      const result = runSyntaxCheck();
      expect(result.code).toBe(1);
      expect(result.output).toContain('FAILED');
    } finally {
      if (existsSync(brokenPath)) unlinkSync(brokenPath);
    }
  });

  it('detects bracket imbalance', () => {
    const brokenPath = join(root, 'app', '_syntax_test_tmp2.ts');
    writeFileSync(brokenPath, 'function f() { return (1 + 2; }\n');
    try {
      const result = runSyntaxCheck();
      expect(result.code).toBe(1);
    } finally {
      if (existsSync(brokenPath)) unlinkSync(brokenPath);
    }
  });

  it('returns to passing after broken file removed', () => {
    // 前のテストで一時ファイルが消えていることを前提に再確認
    const result = runSyntaxCheck();
    expect(result.code).toBe(0);
  });
});
