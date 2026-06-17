/**
 * i18n Manager
 *
 * 1000+言語対応の国際化基盤。
 * - Lazy loading: 必要な言語のみダウンロード
 * - Fallback chain: 言語 → ファミリー → 英語 → キー
 * - ICU MessageFormat: 複数形・性別・選択子対応
 * - RTL: アラビア/ヘブライ等の自動レイアウト切替
 *
 * 設計:
 * - キーは階層構造 (domain.feature.element)
 * - 翻訳は JSON で言語別ファイル
 * - 動的読み込みで初期バンドル軽量化
 */

export type LocaleCode = string; // BCP 47 (例: 'ja', 'en-US', 'zh-Hans')

export interface TranslationMap {
  [key: string]: string | TranslationMap;
}

export interface I18nConfig {
  defaultLocale: LocaleCode;
  fallbackLocale: LocaleCode;
  loadPath: string; // 例: '/i18n/{locale}.json'
  preload?: LocaleCode[];
}

export interface InterpolationParams {
  [key: string]: string | number | Date | undefined;
  count?: number;
}

/**
 * 言語ファミリーマップ。
 * 翻訳が無い場合のフォールバック先決定に使用。
 */
const LANGUAGE_FAMILY: Record<string, string> = {
  // 日本語族
  'ja-JP': 'ja',
  'ja-Kana': 'ja',
  // 中国語族
  'zh-Hans': 'zh',
  'zh-Hant': 'zh',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'zh-HK': 'zh-Hant',
  // 英語族
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
  'en-CA': 'en',
  // スペイン語族
  'es-ES': 'es',
  'es-MX': 'es',
  'es-AR': 'es',
  // ポルトガル語族
  'pt-BR': 'pt',
  'pt-PT': 'pt',
  // フランス語族
  'fr-FR': 'fr',
  'fr-CA': 'fr',
  // ドイツ語族
  'de-DE': 'de',
  'de-AT': 'de',
  'de-CH': 'de',
};

/**
 * RTL (右→左) 言語リスト。
 */
const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'ji', 'iw', 'ku', 'ps', 'sd',
]);

export class I18nManager {
  private config: I18nConfig;
  private currentLocale: LocaleCode;
  private translations = new Map<LocaleCode, TranslationMap>();
  private loadingPromises = new Map<LocaleCode, Promise<void>>();
  private listeners = new Set<(locale: LocaleCode) => void>();

  constructor(config: I18nConfig) {
    this.config = config;
    this.currentLocale = this.detectLocale();
  }

  /**
   * ブラウザ設定から言語自動検出。
   */
  private detectLocale(): LocaleCode {
    if (typeof navigator === 'undefined') return this.config.defaultLocale;
    const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage;
    return browserLang || this.config.defaultLocale;
  }

  /**
   * 初期化: デフォルト + プリロード言語を読み込み。
   */
  async init(): Promise<void> {
    await this.loadLocale(this.config.defaultLocale);
    if (this.currentLocale !== this.config.defaultLocale) {
      await this.loadLocale(this.currentLocale).catch(() => {
        // フォールバック
        this.currentLocale = this.config.defaultLocale;
      });
    }
    if (this.config.preload) {
      await Promise.allSettled(
        this.config.preload.map(loc => this.loadLocale(loc))
      );
    }
  }

  /**
   * 言語ファイル動的読み込み。
   */
  async loadLocale(locale: LocaleCode): Promise<void> {
    // Validate the locale shape before it is interpolated into a fetch path,
    // so a crafted value (e.g. '../../secret') cannot traverse outside the
    // locale directory. BCP 47: language[-script][-region][-variant…].
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(locale)) {
      throw new Error(`Invalid locale code: ${locale}`);
    }
    if (this.translations.has(locale)) return;
    let promise = this.loadingPromises.get(locale);
    if (promise) return promise;

    promise = (async () => {
      const path = this.config.loadPath.replace('{locale}', locale);
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load locale: ${locale}`);
      const data = (await res.json()) as TranslationMap;
      this.translations.set(locale, data);
    })();

    this.loadingPromises.set(locale, promise);
    try {
      await promise;
    } finally {
      this.loadingPromises.delete(locale);
    }
  }

  /**
   * 言語切替。
   */
  async setLocale(locale: LocaleCode): Promise<void> {
    if (locale === this.currentLocale) return;
    await this.loadLocale(locale);
    this.currentLocale = locale;
    this.notifyListeners();
  }

  getLocale(): LocaleCode {
    return this.currentLocale;
  }

  /**
   * 現在言語が RTL かどうか。
   */
  isRTL(): boolean {
    const base = this.currentLocale.split('-')[0];
    return RTL_LANGUAGES.has(base);
  }

  /**
   * 翻訳取得。
   * フォールバックチェーン: 現在言語 → ファミリー → 英語 → キー名
   */
  t(key: string, params?: InterpolationParams): string {
    const chain = this.buildFallbackChain(this.currentLocale);
    for (const locale of chain) {
      const value = this.lookup(locale, key);
      if (value !== undefined) {
        return this.interpolate(value, params, locale);
      }
    }
    return key;
  }

  /**
   * 翻訳が存在するか確認。
   */
  has(key: string): boolean {
    const chain = this.buildFallbackChain(this.currentLocale);
    return chain.some(loc => this.lookup(loc, key) !== undefined);
  }

  /**
   * フォールバックチェーン構築。
   */
  private buildFallbackChain(locale: LocaleCode): LocaleCode[] {
    const chain: LocaleCode[] = [locale];

    // ファミリー言語
    const family = LANGUAGE_FAMILY[locale];
    if (family && !chain.includes(family)) chain.push(family);

    // 言語ベース (例: 'en-US' → 'en')
    const base = locale.split('-')[0];
    if (base !== locale && !chain.includes(base)) chain.push(base);

    // フォールバック言語
    if (!chain.includes(this.config.fallbackLocale)) {
      chain.push(this.config.fallbackLocale);
    }

    return chain;
  }

  /**
   * 翻訳マップから階層キーで値検索。
   */
  private lookup(locale: LocaleCode, key: string): string | undefined {
    const map = this.translations.get(locale);
    if (!map) return undefined;
    const parts = key.split('.');
    let current: string | TranslationMap = map;
    for (const part of parts) {
      if (typeof current !== 'object' || current === null) return undefined;
      const next: string | TranslationMap | undefined = (current as TranslationMap)[part];
      if (next === undefined) return undefined;
      current = next;
    }
    return typeof current === 'string' ? current : undefined;
  }

  /**
   * 文字列補完。{name} → 値置換、複数形対応。
   */
  private interpolate(
    template: string,
    params: InterpolationParams | undefined,
    locale: LocaleCode
  ): string {
    if (!params) return template;

    // 複数形対応: {count, plural, one {...} other {...}}
    // Brace-aware (not regex): ICU plural option bodies themselves contain
    // braces, so a `[^}]+` capture truncated the body at the first `}` and left
    // the remainder (e.g. " other {# items}}") as literal garbage in the output.
    let result = this.replacePlurals(template, params, locale);

    // 通常変数: {name}
    result = result.replace(/\{(\w+)\}/g, (_, key) => {
      const value = params[key];
      if (value === undefined) return `{${key}}`;
      if (value instanceof Date) {
        return new Intl.DateTimeFormat(locale).format(value);
      }
      if (typeof value === 'number') {
        return new Intl.NumberFormat(locale).format(value);
      }
      return String(value);
    });

    return result;
  }

  /**
   * Replace every `{key, plural, …}` construct using brace-depth matching so
   * nested option braces are handled correctly. Non-plural `{…}` spans are left
   * untouched for the simple-variable pass.
   */
  private replacePlurals(
    template: string,
    params: InterpolationParams,
    locale: LocaleCode
  ): string {
    let result = '';
    let i = 0;
    while (i < template.length) {
      if (template[i] === '{') {
        const head = /^\{(\w+),\s*plural,\s*/.exec(template.slice(i));
        if (head) {
          const end = this.matchBrace(template, i);
          if (end !== -1) {
            const key = head[1];
            const body = template.slice(i + head[0].length, end); // option list, sans final '}'
            const count = Number(params[key]);
            result += Number.isNaN(count) ? '' : this.selectPlural(count, body, locale);
            i = end + 1;
            continue;
          }
        }
      }
      result += template[i];
      i++;
    }
    return result;
  }

  /**
   * Return the index of the `}` matching the `{` at `open`, or -1 if unbalanced.
   */
  private matchBrace(s: string, open: number): number {
    let depth = 0;
    for (let j = open; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) return j;
    }
    return -1;
  }

  /**
   * 複数形ルール選択 (簡易ICU MessageFormat)。
   */
  private selectPlural(count: number, rules: string, locale: LocaleCode): string {
    const pluralRules = new Intl.PluralRules(locale);
    const category = pluralRules.select(count);
    const ruleMap = this.parsePluralRules(rules);
    const chosen = ruleMap.get(category) ?? ruleMap.get('other') ?? '';
    // ICU '#' is the count placeholder; may appear multiple times.
    return chosen.replace(/#/g, String(count));
  }

  /**
   * Parse `category {text}` option pairs with brace-depth matching, so option
   * text containing braces is captured intact (the old `\{([^}]*)\}` regex
   * stopped at the first inner `}`).
   */
  private parsePluralRules(rules: string): Map<string, string> {
    const map = new Map<string, string>();
    let i = 0;
    while (i < rules.length) {
      while (i < rules.length && /\s/.test(rules[i])) i++;          // skip whitespace
      const start = i;
      while (i < rules.length && /\w/.test(rules[i])) i++;          // category word
      const category = rules.slice(start, i);
      while (i < rules.length && /\s/.test(rules[i])) i++;          // skip whitespace
      if (rules[i] !== '{') break;                                  // malformed → stop
      const end = this.matchBrace(rules, i);
      if (end === -1) break;
      if (category) map.set(category, rules.slice(i + 1, end));
      i = end + 1;
    }
    return map;
  }

  /**
   * 言語切替リスナー登録。
   */
  subscribe(listener: (locale: LocaleCode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l(this.currentLocale));
  }

  /**
   * 利用可能な全言語リスト (登録済み)。
   */
  getAvailableLocales(): LocaleCode[] {
    return Array.from(this.translations.keys());
  }
}

/**
 * グローバルシングルトン。
 * アプリ全体で共有する I18nManager インスタンス。
 */
let globalInstance: I18nManager | null = null;

export function setupI18n(config: I18nConfig): I18nManager {
  globalInstance = new I18nManager(config);
  return globalInstance;
}

export function i18n(): I18nManager {
  if (!globalInstance) {
    throw new Error('I18n not initialized. Call setupI18n() first.');
  }
  return globalInstance;
}

/**
 * ショートハンド: t('key.path', { params })
 */
export function t(key: string, params?: InterpolationParams): string {
  return i18n().t(key, params);
}
