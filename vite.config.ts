/**
 * Artone v3 - Vite Build Configuration
 * 
 * Carmack: 最小バンドル、最速ビルド
 * Martin: 環境分離、設定明示
 * Pike: シンプル設定
 */

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readdirSync, mkdirSync, copyFileSync } from 'fs';
import { visualizer } from 'rollup-plugin-visualizer';

// ==================================================
// 環境変数
// ==================================================
const isProd = process.env.NODE_ENV === 'production';
const isAnalyze = process.env.ANALYZE === 'true';

// i18n/*.json is fetched at runtime as '/i18n/{locale}.json' (see
// i18n/i18n-manager.ts loadLocale()), but it lives outside `publicDir` so
// `vite build` never copies it into dist/. Without this, every locale load
// 404s in production and every t() call silently falls back to raw keys.
function copyI18nLocalesPlugin(): Plugin {
  return {
    name: 'copy-i18n-locales',
    apply: 'build',
    closeBundle() {
      const srcDir = resolve(__dirname, 'i18n');
      const outDir = resolve(__dirname, 'dist/i18n');
      mkdirSync(outDir, { recursive: true });
      for (const file of readdirSync(srcDir)) {
        if (file.endsWith('.json')) {
          copyFileSync(resolve(srcDir, file), resolve(outDir, file));
        }
      }
    },
  };
}

// ==================================================
// Vite Configuration
// ==================================================
export default defineConfig({
  // ----- プラグイン -----
  plugins: [
    react({
      // React Fast Refresh は既定で有効
      // Babel設定 (最小)
      babel: {
        plugins: isProd ? [
          ['transform-remove-console', { exclude: ['error', 'warn'] }]
        ] : []
      }
    }),

    // バンドル分析 (ANALYZE=true で有効)
    isAnalyze && visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true
    }),

    copyI18nLocalesPlugin()
  ].filter(Boolean),

  // ----- ビルド設定 -----
  build: {
    target: ['chrome100', 'firefox100', 'safari15'],
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: isProd ? 'hidden' : true,
    minify: isProd ? 'esbuild' : false,
    
    // チャンク分割
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: {
          // コア依存
          'vendor-react': ['react', 'react-dom']
        },
        // ファイル名ハッシュ
        entryFileNames: isProd ? 'js/[name].[hash].js' : 'js/[name].js',
        chunkFileNames: isProd ? 'js/[name].[hash].js' : 'js/[name].js',
        assetFileNames: isProd ? 'assets/[name].[hash].[ext]' : 'assets/[name].[ext]'
      }
    },
    
    // チャンクサイズ警告
    chunkSizeWarningLimit: 1000,
    
    // CSS コード分割
    cssCodeSplit: true,
    
    // CommonJS → ESM
    commonjsOptions: {
      transformMixedEsModules: true
    }
  },

  // ----- 開発サーバー -----
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    
    // COOP/COEP ヘッダー (SharedArrayBuffer用)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    },
    
    // HMR
    hmr: {
      overlay: true
    },
    
    // プロキシ
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },

  // ----- プレビューサーバー -----
  preview: {
    port: 4000,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },

  // ----- パス解決 -----
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@core': resolve(__dirname, 'core'),
      '@ai': resolve(__dirname, 'ai'),
      '@audio': resolve(__dirname, 'audio'),
      '@color': resolve(__dirname, 'color'),
      '@timeline': resolve(__dirname, 'timeline'),
      '@render': resolve(__dirname, 'render'),
      '@export': resolve(__dirname, 'export'),
      '@plugins': resolve(__dirname, 'plugins'),
      '@collab': resolve(__dirname, 'collab'),
      '@animation': resolve(__dirname, 'animation'),
      '@project': resolve(__dirname, 'project'),
      '@media': resolve(__dirname, 'media')
    }
  },

  // ----- 依存関係最適化 -----
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'lodash-es',
      'uuid'
    ],
    exclude: [
      '@xenova/transformers' // AI モデルは動的ロード
    ]
  },

  // ----- Worker設定 -----
  worker: {
    format: 'es',
    plugins: () => []
  },

  // ----- 環境変数 -----
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '3.0.0'),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __DEV__: JSON.stringify(!isProd)
  },

  // ----- esbuild設定 -----
  esbuild: {
    // JSX
    jsx: 'automatic',
    // ドロップ
    drop: isProd ? ['debugger'] : [],
    // ターゲット
    target: 'es2022',
    // 法的コメント
    legalComments: 'none'
  }
});
