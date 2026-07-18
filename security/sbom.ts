/**
 * SBOM (Software Bill of Materials) + サプライチェーン監査
 *
 * 10年運用に必須:
 * - SPDX 2.3 / CycloneDX 1.7 形式で SBOM 生成 (lifecycles 対応)
 * - 既知 CVE スキャン
 * - ライセンス互換性チェック
 * - 依存ツリー深度分析
 *
 * SLSA / Executive Order 14028 準拠を意識。
 */

import { uuid } from '../app/utils';
export interface Component {
  name: string;
  version: string;
  type: 'library' | 'framework' | 'application' | 'os';
  purl?: string; // package URL
  license: string | null;
  supplier?: string;
  /** `value` is hex-encoded (the only producer, generate.ts's normalizeHash,
   *  already converts npm's base64 integrity value to hex). */
  hash?: { algorithm: string; value: string };
  homepage?: string;
  description?: string;
}

export interface Dependency {
  ref: string; // component name@version
  dependsOn: string[];
}

export interface BOM {
  bomFormat: 'CycloneDX' | 'SPDX';
  specVersion: string;
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    /** CycloneDX 1.7: SBOM 生成タイミング (design/pre-build/build/post-build/operations) */
    lifecycles?: Array<{ phase: 'design' | 'pre-build' | 'build' | 'post-build' | 'operations' | 'discovery' | 'decommission' }>;
    tools: string[];
    component: Component;
  };
  components: Component[];
  dependencies: Dependency[];
}

// === ライセンス分類 ===

export type LicenseCategory =
  | 'permissive' // MIT, BSD, Apache
  | 'weak-copyleft' // LGPL, MPL
  | 'strong-copyleft' // GPL, AGPL
  | 'proprietary'
  | 'unknown';

const LICENSE_CATEGORIES: Record<string, LicenseCategory> = {
  MIT: 'permissive',
  'MIT-0': 'permissive',
  'BSD-2-Clause': 'permissive',
  'BSD-3-Clause': 'permissive',
  'Apache-2.0': 'permissive',
  ISC: 'permissive',
  'Unlicense': 'permissive',
  'CC0-1.0': 'permissive',
  '0BSD': 'permissive',
  'Zlib': 'permissive',
  'LGPL-2.1': 'weak-copyleft',
  'LGPL-2.1-only': 'weak-copyleft',
  'LGPL-2.1-or-later': 'weak-copyleft',
  'LGPL-3.0': 'weak-copyleft',
  'LGPL-3.0-only': 'weak-copyleft',
  'LGPL-3.0-or-later': 'weak-copyleft',
  'MPL-2.0': 'weak-copyleft',
  'EPL-2.0': 'weak-copyleft',
  'GPL-2.0': 'strong-copyleft',
  'GPL-2.0-only': 'strong-copyleft',
  'GPL-2.0-or-later': 'strong-copyleft',
  'GPL-3.0': 'strong-copyleft',
  'GPL-3.0-only': 'strong-copyleft',
  'GPL-3.0-or-later': 'strong-copyleft',
  'AGPL-3.0': 'strong-copyleft',
  'AGPL-3.0-only': 'strong-copyleft',
  'AGPL-3.0-or-later': 'strong-copyleft',
};

export class LicenseAnalyzer {
  static categorize(license: string | null): LicenseCategory {
    if (!license) return 'unknown';
    const order: LicenseCategory[] = [
      'unknown',
      'permissive',
      'weak-copyleft',
      'strong-copyleft',
      'proprietary',
    ];
    const stripped = license.replace(/[(),]/g, ' ').trim();

    // REGRESSION fix: a pure SPDX "OR" expression (e.g. "MIT OR GPL-3.0") is
    // a dual/multi-license CHOICE -- the licensee may pick whichever term
    // they prefer, so the correct compatibility category is the WEAKEST
    // (most permissive) option available, not the strongest. The previous
    // code treated OR identically to AND and always took the strongest
    // term, so a project under MIT would be wrongly flagged as conflicting
    // with a dependency that is *also* available under MIT (just offered
    // alongside GPL as an alternative). AND/WITH combinations (every term
    // must be satisfied simultaneously) and anything with mixed/nested
    // structure keep the previous strongest-wins behavior, which is the
    // correct (conservative) answer for those cases.
    if (/\bOR\b/i.test(stripped) && !/\bAND\b/i.test(stripped)) {
      const orTokens = stripped
        .split(/\s+OR\s+/i)
        .map((t) => t.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      const cats = orTokens.map((t) => LICENSE_CATEGORIES[t]).filter((c): c is LicenseCategory => !!c);
      if (cats.length === 0) return 'unknown';
      return cats.reduce((weakest, c) => (order.indexOf(c) < order.indexOf(weakest) ? c : weakest));
    }

    // 正確マッチ: SPDX identifier の単語境界で判定 (comma-separated lists are
    // also treated as AND-equivalent, matching the original tokenization)
    const tokens = license
      .split(/\s+(?:OR|AND|WITH)\s+|[(),]/i)
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);

    let strongest: LicenseCategory = 'permissive';
    let matched = false;
    for (const tok of tokens) {
      const cat = LICENSE_CATEGORIES[tok];
      if (cat) {
        matched = true;
        if (order.indexOf(cat) > order.indexOf(strongest)) {
          strongest = cat;
        }
      }
    }
    return matched ? strongest : 'unknown';
  }

  /**
   * プロジェクトライセンスとの互換性検査。
   * 例: MIT プロジェクトに GPL 依存はインクルージョン不可。
   */
  static compatible(projectLicense: string, depLicense: string | null): {
    compatible: boolean;
    warning?: string;
  } {
    const projectCat = this.categorize(projectLicense);
    const depCat = this.categorize(depLicense);

    if (depCat === 'unknown') {
      return { compatible: false, warning: `Unknown license: ${depLicense}` };
    }

    if (depCat === 'strong-copyleft' && projectCat === 'permissive') {
      return {
        compatible: false,
        warning: `${depLicense} is copyleft, conflicts with ${projectLicense}`,
      };
    }

    return { compatible: true };
  }

  static summarize(components: Component[]): Record<LicenseCategory, number> {
    const summary: Record<LicenseCategory, number> = {
      permissive: 0,
      'weak-copyleft': 0,
      'strong-copyleft': 0,
      proprietary: 0,
      unknown: 0,
    };
    for (const c of components) {
      summary[this.categorize(c.license)]++;
    }
    return summary;
  }
}

// === CVE データベース (簡易ローカル) ===

export interface CVE {
  id: string;
  package: string;
  affectedVersions: string; // semver range
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  fixedIn?: string;
  cvss?: number;
}

export interface VulnerabilityReport {
  component: string;
  version: string;
  vulnerabilities: CVE[];
}

export class VulnerabilityScanner {
  private cves: CVE[] = [];

  loadDatabase(cves: CVE[]): void {
    this.cves = cves;
  }

  scan(components: Component[]): VulnerabilityReport[] {
    const reports: VulnerabilityReport[] = [];
    for (const c of components) {
      const matches = this.cves.filter(
        (cve) => cve.package === c.name && this.versionMatches(c.version, cve.affectedVersions)
      );
      if (matches.length > 0) {
        reports.push({ component: c.name, version: c.version, vulnerabilities: matches });
      }
    }
    return reports;
  }

  private versionMatches(version: string, range: string): boolean {
    if (range === '*') return true;
    const trimmed = range.trim();

    // OR 結合 ("1.x || 2.x")
    if (trimmed.includes('||')) {
      return trimmed.split('||').some((sub) => this.versionMatches(version, sub.trim()));
    }

    // ハイフン範囲 ("1.0.0 - 2.0.0" → inclusive range, node-semver syntax)
    // REGRESSION fix: without this branch, the range fell through to the AND
    // split below, splitting into e.g. ["1.0.0", "-", "2.0.0"] and requiring
    // ALL THREE tokens (including the literal "-") to independently match --
    // "-" can never equal any real version, so parts.every(...) was always
    // false. The range therefore matched NO version, for any input: a
    // silent, fail-open false negative in a vulnerability scanner (a CVE
    // declared with a hyphen range would never be flagged, even for a
    // version squarely inside it).
    const hyphenMatch = trimmed.match(/^(\S+)\s+-\s+(\S+)$/);
    if (hyphenMatch) {
      const [, lo, hi] = hyphenMatch;
      return this.compareVersions(version, lo) >= 0 && this.compareVersions(version, hi) <= 0;
    }

    // AND 結合 (">=1.0.0 <2.0.0")
    if (/\s+/.test(trimmed) && !trimmed.startsWith(' ')) {
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        return parts.every((p) => this.versionMatches(version, p));
      }
    }

    // ワイルドカード "1.x" / "1.2.x"
    if (trimmed.endsWith('.x') || trimmed.endsWith('.*')) {
      const prefix = trimmed.slice(0, -2);
      return version.startsWith(prefix + '.') || version === prefix;
    }

    // チルダ "~1.2.3" → >=1.2.3 <1.3.0
    if (trimmed.startsWith('~')) {
      const base = trimmed.slice(1);
      const [maj, min] = base.split('.').map(Number);
      const upper = `${maj}.${(min ?? 0) + 1}.0`;
      return (
        this.compareVersions(version, base) >= 0 &&
        this.compareVersions(version, upper) < 0
      );
    }

    // キャレット: 最左の「非ゼロ」要素を変えない変更のみ許容する (node-semver 準拠)。
    // 上限計算は caretUpperBound に切り出す (^0.y.z の zero-major 特例を含む)。
    if (trimmed.startsWith('^')) {
      const base = trimmed.slice(1);
      const upper = this.caretUpperBound(base);
      return (
        this.compareVersions(version, base) >= 0 &&
        this.compareVersions(version, upper) < 0
      );
    }

    // 比較演算子
    const m = trimmed.match(/^([<>=]+)\s*(.+)$/);
    if (!m) return version === trimmed;
    const [, op, target] = m;
    const cmp = this.compareVersions(version, target.trim());
    if (op === '<') return cmp < 0;
    if (op === '<=') return cmp <= 0;
    if (op === '>') return cmp > 0;
    if (op === '>=') return cmp >= 0;
    if (op === '=' || op === '==') return cmp === 0;
    return false;
  }

  /**
   * キャレット範囲 "^x.y.z" の排他的上限を返す (node-semver 準拠)。
   * キャレットは最左の「非ゼロ」要素を変えない変更のみ許容する:
   *   ^1.2.3 → 2.0.0   (major を上げる)
   *   ^0.2.3 → 0.3.0   (major=0 なので minor を上げる)
   *   ^0.0.3 → 0.0.4   (major=minor=0 なので patch を上げる)
   * 以前は常に (major+1).0.0 を上限にしており、^0.y.z を 0.x 全体と誤って
   * 一致させ、脆弱性スキャナの過検出 (非脆弱バージョンでの偽陽性) を招いていた。
   */
  private caretUpperBound(base: string): string {
    const [maj, min, pat] = base.split('.').map((n) => parseInt(n, 10) || 0);
    if (maj > 0) return `${maj + 1}.0.0`;
    if (min > 0) return `0.${min + 1}.0`;
    return `0.0.${pat + 1}`;
  }

  /**
   * SemVer 2.0.0 比較。prerelease (1.0.0-beta) も対応。
   * 仕様: prerelease は通常版より低い扱い。
   */
  private compareVersions(a: string, b: string): number {
    const parse = (v: string) => {
      const [main, pre] = v.split('-');
      const parts = main.split('.').map((x) => parseInt(x) || 0);
      return { parts, pre: pre ?? null };
    };
    const pa = parse(a);
    const pb = parse(b);

    for (let i = 0; i < Math.max(pa.parts.length, pb.parts.length); i++) {
      const x = pa.parts[i] ?? 0;
      const y = pb.parts[i] ?? 0;
      if (x !== y) return x - y;
    }

    // 主バージョン同じ → prerelease 比較
    if (pa.pre === null && pb.pre === null) return 0;
    if (pa.pre === null) return 1; // 1.0.0 > 1.0.0-beta
    if (pb.pre === null) return -1;

    // prerelease 文字列辞書比較
    return pa.pre < pb.pre ? -1 : pa.pre > pb.pre ? 1 : 0;
  }
}

// === SBOM ジェネレータ ===

export class SBOMGenerator {
  generate(
    project: Component,
    components: Component[],
    dependencies: Dependency[]
  ): BOM {
    return {
      bomFormat: 'CycloneDX',
      specVersion: '1.7',
      serialNumber: `urn:uuid:${uuid()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        lifecycles: [{ phase: 'build' }], // CycloneDX 1.7: ビルド時生成を明示
        tools: ['artone-sbom'],
        component: project,
      },
      components,
      dependencies,
    };
  }

  toJSON(bom: BOM): string {
    return JSON.stringify(bom, null, 2);
  }

  toSPDX(bom: BOM): string {
    const lines: string[] = [];
    lines.push('SPDXVersion: SPDX-2.3');
    lines.push('DataLicense: CC0-1.0');
    lines.push(`SPDXID: SPDXRef-DOCUMENT`);
    lines.push(`DocumentName: ${bom.metadata.component.name}-${bom.metadata.component.version}`);
    lines.push(`DocumentNamespace: ${bom.serialNumber}`);
    lines.push(`Creator: Tool: artone-sbom`);
    lines.push(`Created: ${bom.metadata.timestamp}`);
    lines.push('');

    for (const c of bom.components) {
      const id = `SPDXRef-${c.name.replace(/[^a-z0-9]/gi, '-')}`;
      lines.push(`PackageName: ${c.name}`);
      lines.push(`SPDXID: ${id}`);
      lines.push(`PackageVersion: ${c.version}`);
      lines.push(`PackageLicenseConcluded: ${c.license ?? 'NOASSERTION'}`);
      lines.push(`PackageLicenseDeclared: ${c.license ?? 'NOASSERTION'}`);
      lines.push(`PackageDownloadLocation: ${c.homepage ?? 'NOASSERTION'}`);
      if (c.hash && /^[0-9a-f]+$/i.test(c.hash.value)) {
        // SPDX 仕様: PackageChecksum: <ALGO>: <hex>
        // c.hash.value is already hex (generate.ts's normalizeHash converts
        // npm's base64 integrity value once, at construction time) — do not
        // re-decode it here. Re-running it through a base64→hex conversion
        // silently produced a corrupt checksum, since hex digits happen to
        // also be valid base64 characters (no throw, just wrong bytes).
        const algoMap: Record<string, string> = {
          sha1: 'SHA1',
          sha256: 'SHA256',
          sha384: 'SHA384',
          sha512: 'SHA512',
          md5: 'MD5',
        };
        const spdxAlgo = algoMap[c.hash.algorithm.toLowerCase()] ?? c.hash.algorithm.toUpperCase();
        lines.push(`PackageChecksum: ${spdxAlgo}: ${c.hash.value.toLowerCase()}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// === 統合監査 ===

export interface SupplyChainReport {
  bom: BOM;
  licenseSummary: Record<LicenseCategory, number>;
  licenseConflicts: Array<{ component: string; warning: string }>;
  vulnerabilities: VulnerabilityReport[];
  summary: {
    totalComponents: number;
    criticalVulns: number;
    highVulns: number;
    licenseIssues: number;
    passed: boolean;
  };
}

export class SupplyChainAuditor {
  audit(
    project: Component,
    components: Component[],
    dependencies: Dependency[],
    cves: CVE[] = []
  ): SupplyChainReport {
    const generator = new SBOMGenerator();
    const bom = generator.generate(project, components, dependencies);

    const licenseSummary = LicenseAnalyzer.summarize(components);

    const licenseConflicts: Array<{ component: string; warning: string }> = [];
    for (const c of components) {
      const r = LicenseAnalyzer.compatible(project.license ?? 'MIT', c.license);
      if (!r.compatible && r.warning) {
        licenseConflicts.push({ component: `${c.name}@${c.version}`, warning: r.warning });
      }
    }

    const scanner = new VulnerabilityScanner();
    scanner.loadDatabase(cves);
    const vulnerabilities = scanner.scan(components);

    const allVulns = vulnerabilities.flatMap((r) => r.vulnerabilities);
    const criticalVulns = allVulns.filter((v) => v.severity === 'critical').length;
    const highVulns = allVulns.filter((v) => v.severity === 'high').length;

    return {
      bom,
      licenseSummary,
      licenseConflicts,
      vulnerabilities,
      summary: {
        totalComponents: components.length,
        criticalVulns,
        highVulns,
        licenseIssues: licenseConflicts.length,
        passed: criticalVulns === 0 && licenseConflicts.length === 0,
      },
    };
  }

  formatReport(report: SupplyChainReport): string {
    const lines: string[] = [];
    lines.push('=== Supply Chain Audit ===');
    lines.push(`Components: ${report.summary.totalComponents}`);
    lines.push(`Status: ${report.summary.passed ? 'PASS' : 'FAIL'}`);
    lines.push('');

    lines.push('License Summary:');
    for (const [cat, count] of Object.entries(report.licenseSummary)) {
      if (count > 0) lines.push(`  ${cat}: ${count}`);
    }
    lines.push('');

    if (report.licenseConflicts.length > 0) {
      lines.push(`License Conflicts (${report.licenseConflicts.length}):`);
      for (const c of report.licenseConflicts) {
        lines.push(`  - ${c.component}: ${c.warning}`);
      }
      lines.push('');
    }

    if (report.vulnerabilities.length > 0) {
      lines.push(`Vulnerabilities:`);
      for (const r of report.vulnerabilities) {
        for (const v of r.vulnerabilities) {
          lines.push(
            `  [${v.severity.toUpperCase()}] ${r.component}@${r.version}: ${v.id} — ${v.description}`
          );
          if (v.fixedIn) lines.push(`    Fix: upgrade to ${v.fixedIn}`);
        }
      }
    }

    return lines.join('\n');
  }
}

// === ファクトリ ===

export const supplyChain = {
  auditor: () => new SupplyChainAuditor(),
  scanner: () => new VulnerabilityScanner(),
  sbom: () => new SBOMGenerator(),
  license: LicenseAnalyzer,
};
