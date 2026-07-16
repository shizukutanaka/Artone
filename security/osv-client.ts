/**
 * OSV (Open Source Vulnerabilities) クライアント
 *
 * Google が提供する無料の脆弱性データベース連携。
 * https://osv.dev/ — npm/PyPI/Cargo/Maven 等 OSS パッケージを網羅。
 *
 * 設計:
 * - オンライン: api.osv.dev に問い合わせ
 * - オフライン: ローカルキャッシュから読み込み
 * - 自前 CVE DB との統合可能
 *
 * 10年運用を意識: API が無くなってもオフラインで動く。
 */

import type { CVE } from './sbom';
import { createLogger } from '../app/logger';
const log = createLogger('OSVClient');

export interface OSVQuery {
  package: { name: string; ecosystem: string };
  version?: string;
}

export interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  modified: string;
  published?: string;
  affected: Array<{
    package: { name: string; ecosystem: string };
    ranges?: Array<{
      type: 'SEMVER' | 'ECOSYSTEM' | 'GIT';
      events: Array<{ introduced?: string; fixed?: string; limit?: string }>;
    }>;
    versions?: string[];
  }>;
  database_specific?: {
    severity?: string;
    cwe_ids?: string[];
  };
  severity?: Array<{ type: 'CVSS_V3'; score: string }>;
}

export interface OSVResponse {
  vulns?: OSVVulnerability[];
}

// === エコシステム判定 ===

export type Ecosystem = 'npm' | 'PyPI' | 'crates.io' | 'Go' | 'Maven' | 'NuGet' | 'RubyGems';

/**
 * パッケージ名から ecosystem 推測。
 * 拡張プロジェクト (Python/Rust 等) で OSV 連携時に使用。
 */
export function inferEcosystem(packageName: string): Ecosystem {
  // Maven / NuGet / Go は名前空間慣習で判定
  if (packageName.includes('/') && !packageName.startsWith('@')) {
    return 'Go'; // github.com/owner/repo パターン
  }
  if (packageName.includes(':')) {
    return 'Maven'; // groupId:artifactId
  }
  // 接頭辞ヒューリスティック
  if (packageName.startsWith('python-') || /^[a-z][a-z0-9-_.]*$/.test(packageName)) {
    // npm パッケージも小文字のみが多い。デフォルトは npm
    return 'npm';
  }
  return 'npm';
}

// === CVSS スコア → severity 変換 ===

export function cvssToSeverity(cvss: number): 'low' | 'medium' | 'high' | 'critical' {
  if (cvss >= 9.0) return 'critical';
  if (cvss >= 7.0) return 'high';
  if (cvss >= 4.0) return 'medium';
  return 'low';
}

/**
 * CVSS v3 ベクトル文字列から base score を概算。
 * 完全な CVSS 計算式は重いので、影響範囲(Impact) と攻撃難易度(Exploitability) のヒューリスティック。
 *
 * 仕様: https://www.first.org/cvss/v3.1/specification-document
 */
function parseCVSSScore(severity: string): number {
  // パターン1: 単純数値 "9.8"
  const directMatch = severity.match(/^(\d+\.?\d*)$/);
  if (directMatch) return parseFloat(directMatch[1]);

  // パターン2: スコア併記 "CVSS:3.1/9.8/AV:N..."
  const cleaned = severity.replace(/^CVSS:[\d.]+\/?/, '');
  const scoreOnly = cleaned.match(/^(\d+\.?\d*)\//);
  if (scoreOnly) return parseFloat(scoreOnly[1]);

  // パターン3: フルベクトル "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"
  // 簡易計算: 主要メトリクスのみ参照
  const vec = severity;
  let score = 5.0;
  const av = vec.match(/AV:([NALP])/)?.[1];
  const ac = vec.match(/AC:([LH])/)?.[1];
  const pr = vec.match(/PR:([NLH])/)?.[1];
  const ui = vec.match(/UI:([NR])/)?.[1];
  const s = vec.match(/\bS:([UC])/)?.[1];
  const cConf = vec.match(/(?:^|\/)C:([NLH])/)?.[1];
  const iInt = vec.match(/(?:^|\/)I:([NLH])/)?.[1];
  const aAva = vec.match(/(?:^|\/)A:([NLH])/)?.[1];

  if (av || cConf || iInt || aAva) {
    // Impact 概算 (0-6)
    const cia = (m: string | undefined): number => (m === 'H' ? 0.56 : m === 'L' ? 0.22 : 0);
    const impact = 1 - (1 - cia(cConf)) * (1 - cia(iInt)) * (1 - cia(aAva));
    const impactScore = s === 'C' ? 7.52 * (impact - 0.029) - 3.25 * Math.pow(impact - 0.02, 15) : 6.42 * impact;

    // Exploitability 概算
    const avV = av === 'N' ? 0.85 : av === 'A' ? 0.62 : av === 'L' ? 0.55 : 0.2;
    const acV = ac === 'L' ? 0.77 : 0.44;
    const prV = pr === 'N' ? 0.85 : pr === 'L' ? (s === 'C' ? 0.68 : 0.62) : s === 'C' ? 0.5 : 0.27;
    const uiV = ui === 'N' ? 0.85 : 0.62;
    const exploitability = 8.22 * avV * acV * prV * uiV;

    const base = impact <= 0 ? 0 : Math.min(impactScore + exploitability, 10);
    score = s === 'C' ? Math.min(base * 1.08, 10) : base;
    return Math.round(score * 10) / 10;
  }

  // フォールバック: severity_specific 文字列 ("HIGH" 等)
  if (/critical/i.test(severity)) return 9.5;
  if (/high/i.test(severity)) return 7.5;
  if (/medium|moderate/i.test(severity)) return 5.0;
  if (/low/i.test(severity)) return 2.5;
  return 5.0;
}

// === OSV → CVE 変換 ===

export function osvToCVE(osv: OSVVulnerability, packageName: string): CVE {
  const affected = osv.affected.find((a) => a.package.name === packageName);
  const range = affected?.ranges?.[0];

  // 範囲文字列構築
  //
  // REGRESSION fix: a single `{intro, fixed}` pair only ever kept the LAST
  // introduced/fixed event seen. Real OSV/GHSA entries can have multiple
  // introduced/fixed pairs in one ranges[].events array describing disjoint
  // vulnerable windows (e.g. vulnerable in [0, 1.0.0), fixed, then
  // re-introduced and fixed again in [1.5.0, 2.0.0) after a backport). The
  // old code discarded every window but the last, so a scanned version
  // falling in an earlier vulnerable window was silently reported as safe —
  // a false negative in the exact "critical CVE は自動的に CI 失敗" path.
  // Each closed window becomes its own range joined by "||", the OR-combine
  // format sbom.ts's versionMatches() already supports for affected.versions.
  let affectedVersions = '*';
  if (range && range.type === 'SEMVER') {
    const ranges: string[] = [];
    let intro = '';
    for (const e of range.events) {
      if (e.introduced !== undefined) {
        intro = e.introduced !== '0' ? `>=${e.introduced}` : '';
      } else if (e.fixed || e.limit) {
        const upper = `<${e.fixed ?? e.limit}`;
        ranges.push([intro, upper].filter(Boolean).join(' '));
        intro = '';
      }
    }
    // A trailing open introduced with no closing fixed/limit event means
    // "still vulnerable in every version from `introduced` onward".
    if (intro) ranges.push(intro);
    affectedVersions = ranges.length > 0 ? ranges.join('||') : '*';
  } else if (affected?.versions && affected.versions.length > 0) {
    affectedVersions = affected.versions.join('||');
  }

  // severity 抽出
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
  let cvss: number | undefined;

  if (osv.severity && osv.severity.length > 0) {
    cvss = parseCVSSScore(osv.severity[0].score);
    severity = cvssToSeverity(cvss);
  } else if (osv.database_specific?.severity) {
    const s = osv.database_specific.severity.toLowerCase();
    if (s.includes('critical')) severity = 'critical';
    else if (s.includes('high')) severity = 'high';
    else if (s.includes('low')) severity = 'low';
  }

  // fixedIn 抽出 — 複数の fixed イベントがある場合は最後 (最新の修正版) を採用。
  // "upgrade to X" として表示されるため、re-introduced 後の古い修正版を
  // 提示してしまわないよう最後のイベントを使う。
  const fixedEvent = [...(range?.events ?? [])].reverse().find((e) => e.fixed);

  return {
    id: osv.id,
    package: packageName,
    affectedVersions,
    severity,
    description: osv.summary ?? osv.details?.slice(0, 200) ?? 'No description',
    fixedIn: fixedEvent?.fixed,
    cvss,
  };
}

// === オンラインクライアント ===

export class OSVClient {
  private readonly endpoint: string;
  private readonly fetchFn: typeof fetch;
  private readonly strict: boolean;
  private readonly cache = new Map<string, OSVVulnerability[]>();
  /** クエリ失敗回数 (CI で監視) */
  private failedQueries = 0;

  constructor(options: { endpoint?: string; fetch?: typeof fetch; strict?: boolean } = {}) {
    this.endpoint = options.endpoint ?? 'https://api.osv.dev/v1/query';
    this.fetchFn = options.fetch ?? globalThis.fetch;
    // strict=true: エラー時に throw。CI 用。
    // strict=false (default): warn して空返却。開発用。
    this.strict = options.strict ?? false;
  }

  getFailedQueries(): number {
    return this.failedQueries;
  }

  async query(packageName: string, version: string, ecosystem: Ecosystem = 'npm'): Promise<OSVVulnerability[]> {
    const key = `${ecosystem}/${packageName}@${version}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const body: OSVQuery = { package: { name: packageName, ecosystem }, version };

    try {
      const res = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`OSV API ${res.status}: ${res.statusText}`);
      }
      const data = (await res.json()) as OSVResponse;
      const vulns = data.vulns ?? [];
      this.cache.set(key, vulns);
      return vulns;
    } catch (err) {
      this.failedQueries++;
      if (this.strict) throw err;
      log.warn(`OSV query failed for ${key}:`, err);
      return [];
    }
  }

  async queryBatch(
    packages: Array<{ name: string; version: string }>,
    ecosystem: Ecosystem = 'npm',
    options: { concurrency?: number; delayMs?: number } = {}
  ): Promise<Map<string, CVE[]>> {
    const results = new Map<string, CVE[]>();
    const concurrency = options.concurrency ?? 5; // OSV 推奨は控えめ
    const delayMs = options.delayMs ?? 100;

    for (let i = 0; i < packages.length; i += concurrency) {
      const batch = packages.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (p) => {
          const vulns = await this.query(p.name, p.version, ecosystem);
          return { pkg: p, cves: vulns.map((v) => osvToCVE(v, p.name)) };
        })
      );
      for (const { pkg, cves } of batchResults) {
        if (cves.length > 0) results.set(`${pkg.name}@${pkg.version}`, cves);
      }
      // レートリミット回避 — 連続バッチ間に小休止
      if (i + concurrency < packages.length && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return results;
  }

  serializeCache(): string {
    const obj: Record<string, OSVVulnerability[]> = {};
    for (const [k, v] of this.cache) obj[k] = v;
    return JSON.stringify(obj, null, 2);
  }

  /**
   * キャッシュ JSON ロード。破損データは無視 (ログのみ)。
   * 10年運用: 古いキャッシュフォーマットでも起動を阻害しない。
   */
  loadCache(json: string): { loaded: number; skipped: number } {
    let loaded = 0;
    let skipped = 0;
    try {
      const obj = JSON.parse(json) as unknown;
      if (typeof obj !== 'object' || obj === null) {
        log.warn('OSV cache: invalid root structure, skipping');
        return { loaded: 0, skipped: 0 };
      }
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (Array.isArray(v)) {
          this.cache.set(k, v as OSVVulnerability[]);
          loaded++;
        } else {
          skipped++;
        }
      }
    } catch (err) {
      log.warn('OSV cache: parse failed, ignoring:', err);
    }
    return { loaded, skipped };
  }
}

// === オフラインローカル DB ===

export class OfflineCVEStore {
  private db: CVE[] = [];

  load(json: string): void {
    // Resilient like OSVClient.loadCache: a corrupt or old-format offline cache
    // must never block startup, since this store is the OFFLINE fallback. On any
    // problem the existing db is left untouched (empty for a fresh store).
    try {
      const data = JSON.parse(json) as unknown;
      const cves = (data as { cves?: unknown } | null)?.cves;
      if (Array.isArray(cves)) {
        this.db = cves as CVE[];
      } else {
        log.warn('OfflineCVEStore: missing or invalid "cves" array, ignoring');
      }
    } catch (err) {
      log.warn('OfflineCVEStore: parse failed, ignoring:', err);
    }
  }

  serialize(): string {
    return JSON.stringify({ cves: this.db, updated: new Date().toISOString() }, null, 2);
  }

  add(cves: CVE[]): void {
    // ID 重複排除
    const existing = new Set(this.db.map((c) => c.id));
    for (const c of cves) {
      if (!existing.has(c.id)) {
        this.db.push(c);
        existing.add(c.id);
      }
    }
  }

  query(packageName: string): CVE[] {
    return this.db.filter((c) => c.package === packageName);
  }

  all(): CVE[] {
    return [...this.db];
  }

  size(): number {
    return this.db.length;
  }
}

// === ファクトリ ===

export const osv = {
  client: (opts?: { endpoint?: string; fetch?: typeof fetch }) => new OSVClient(opts),
  store: () => new OfflineCVEStore(),
  cvssToSeverity,
  osvToCVE,
};
