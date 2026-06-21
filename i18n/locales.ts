/**
 * 対応言語メタデータ。
 *
 * Tier 1 (10): 手動翻訳・人手レビュー
 * Tier 2 (100): 機械翻訳 + サンプリングレビュー
 * Tier 3 (900+): 機械翻訳のみ
 *
 * 1000+ 言語対応の基盤。実際の翻訳ファイルは i18n/{locale}.json に配置。
 */

export interface LocaleInfo {
  code: string;        // BCP 47
  name: string;        // 英語名
  nativeName: string;  // ネイティブ名
  rtl: boolean;
  tier: 1 | 2 | 3;
  family?: string;     // 言語ファミリー (フォールバック先)
}

export const TIER1_LOCALES: LocaleInfo[] = [
  { code: 'ja', name: 'Japanese', nativeName: '日本語', rtl: false, tier: 1 },
  { code: 'en', name: 'English', nativeName: 'English', rtl: false, tier: 1 },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', nativeName: '简体中文', rtl: false, tier: 1, family: 'zh' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)', nativeName: '繁體中文', rtl: false, tier: 1, family: 'zh' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', rtl: false, tier: 1 },
  { code: 'es', name: 'Spanish', nativeName: 'Español', rtl: false, tier: 1 },
  { code: 'fr', name: 'French', nativeName: 'Français', rtl: false, tier: 1 },
  { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false, tier: 1 },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false, tier: 1 },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', rtl: false, tier: 1 },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true, tier: 1 },
];

export const TIER2_LOCALES: LocaleInfo[] = [
  { code: 'it', name: 'Italian', nativeName: 'Italiano', rtl: false, tier: 2 },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', rtl: false, tier: 2 },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', rtl: false, tier: 2 },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', rtl: false, tier: 2 },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', rtl: false, tier: 2 },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', rtl: false, tier: 2 },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', rtl: false, tier: 2 },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', rtl: false, tier: 2 },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false, tier: 2 },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', rtl: false, tier: 2 },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', rtl: false, tier: 2 },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', rtl: false, tier: 2 },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', rtl: false, tier: 2 },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', rtl: false, tier: 2 },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', rtl: false, tier: 2 },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', rtl: false, tier: 2 },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', rtl: false, tier: 2 },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true, tier: 2 },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true, tier: 2 },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true, tier: 2 },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', rtl: false, tier: 2 },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', rtl: false, tier: 2 },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', rtl: false, tier: 2 },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', rtl: false, tier: 2 },
  { code: 'is', name: 'Icelandic', nativeName: 'Íslenska', rtl: false, tier: 2 },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', rtl: false, tier: 2 },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', rtl: false, tier: 2 },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', rtl: false, tier: 2 },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', rtl: false, tier: 2 },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', rtl: false, tier: 2 },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', rtl: false, tier: 2 },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', rtl: false, tier: 2 },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', rtl: false, tier: 2 },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', rtl: false, tier: 2 },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', rtl: false, tier: 2 },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', rtl: false, tier: 2 },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', rtl: false, tier: 2 },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', rtl: false, tier: 2 },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', rtl: false, tier: 2 },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', rtl: false, tier: 2 },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', rtl: false, tier: 2 },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog', rtl: false, tier: 2 },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာဘာသာ', rtl: false, tier: 2 },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ', rtl: false, tier: 2 },
  { code: 'lo', name: 'Lao', nativeName: 'ລາວ', rtl: false, tier: 2 },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', rtl: false, tier: 2 },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', rtl: false, tier: 2 },
  { code: 'mn', name: 'Mongolian', nativeName: 'Монгол', rtl: false, tier: 2 },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', rtl: false, tier: 2 },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', rtl: false, tier: 2 },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', rtl: false, tier: 2 },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ', rtl: false, tier: 2 },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek', rtl: false, tier: 2 },
  { code: 'ky', name: 'Kyrgyz', nativeName: 'Кыргызча', rtl: false, tier: 2 },
  { code: 'tg', name: 'Tajik', nativeName: 'Тоҷикӣ', rtl: false, tier: 2 },
  { code: 'tk', name: 'Turkmen', nativeName: 'Türkmençe', rtl: false, tier: 2 },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', rtl: false, tier: 2 },
  { code: 'zu', name: 'Zulu', nativeName: 'IsiZulu', rtl: false, tier: 2 },
  { code: 'xh', name: 'Xhosa', nativeName: 'IsiXhosa', rtl: false, tier: 2 },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', rtl: false, tier: 2 },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo', rtl: false, tier: 2 },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', rtl: false, tier: 2 },
  { code: 'mg', name: 'Malagasy', nativeName: 'Malagasy', rtl: false, tier: 2 },
  { code: 'so', name: 'Somali', nativeName: 'Soomaali', rtl: false, tier: 2 },
  { code: 'ku', name: 'Kurdish', nativeName: 'Kurdî', rtl: true, tier: 2 },
  { code: 'ckb', name: 'Sorani Kurdish', nativeName: 'کوردی', rtl: true, tier: 2 },
];

/**
 * Tier 3 は ISO 639-3 全言語に対応可能 (約 7000+)。
 * 翻訳は機械翻訳パイプラインで自動生成。
 *
 * 動的読み込みのため、メタデータのみ最小化。
 * 詳細は i18n/tier3-locales.json (lazy load)。
 */
export const TIER3_LOCALES_META = {
  loadPath: '/i18n/tier3-locales.json',
  count: 900,
};

export const ALL_TIER1_TIER2 = [...TIER1_LOCALES, ...TIER2_LOCALES];
