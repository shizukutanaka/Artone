/**
 * ESLint Flat Config (eslint v9+)
 *
 * 厳しめ設定。10年運用の品質維持。
 */

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.ts',
      '*.config.js',
      'sw.js',
      'install.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        process: 'readonly',
        globalThis: 'readonly',
        performance: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        ImageData: 'readonly',
        Uint8Array: 'readonly',
        Uint8ClampedArray: 'readonly',
        Float32Array: 'readonly',
        Int32Array: 'readonly',
        ArrayBuffer: 'readonly',
        Promise: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        Date: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Object: 'readonly',
        Array: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Error: 'readonly',
        RegExp: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',

      // 一般
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'multi-line'],
      'no-throw-literal': 'error',

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // 複雑度制限
      'complexity': ['warn', 15],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 4],
    },
  },
  {
    // Console output is intentional in the logger sink (it wraps console),
    // CLI tools (bench/security report to stdout), and tests/e2e diagnostics.
    files: [
      'app/logger.ts',
      'bench/**/*.{ts,tsx}',
      'security/generate.ts',
      'tests/**/*.{ts,tsx}',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // テストでの非 null 表明 (`!`) を許可する。
    //
    // このルールが守っているのは「本番コードが null で落ちること」だが、
    // テストでは null に当たった時点で**そのテストが落ちる**のが正しい振る舞いで
    // あり、`!` は検証の省略ではなく前提の宣言である。`?.` で書き換えると
    // 「null なら黙って通る」テストになり、かえって検証が弱くなる。
    //
    // 実測: 全 964 warnings のうち 671 件がこれで、本番コードの設計負債
    // (max-params / complexity / max-depth 等) が埋もれて見えなくなっていた。
    // 除外の目的は数字を減らすことではなく、**残った警告に意味を持たせる**こと。
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
