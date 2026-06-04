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
    // 正確マッチ: SPDX identifier の単語境界で判定
    const tokens = license
      .split(/\s+(?:OR|AND|WITH)\s+|[(),]/i)
      .map((t) => t.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);

    let strongest: LicenseCategory = 'permissive';
    const order: LicenseCategory[] = [
      'unknown',
      'permissive',
      'weak-copyleft',
      'strong-copyleft',
      'proprietary',
    ];

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

    // キャレット "^1.2.3" → >=1.2.3 <2.0.0
    if (trimmed.startsWith('^')) {
      const base = trimmed.slice(1);
      const major = parseInt(base.split('.')[0]);
      const upper = `${major + 1}.0.0`;
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
      if (c.hash) {
        // SPDX 仕様: PackageChecksum: <ALGO>: <hex>
        // npm integrity は base64 なので hex 変換
        const algoMap: Record<string, string> = {
          sha1: 'SHA1',
          sha256: 'SHA256',
          sha384: 'SHA384',
          sha512: 'SHA512',
          md5: 'MD5',
        };
        const spdxAlgo = algoMap[c.hash.algorithm.toLowerCase()] ?? c.hash.algorithm.toUpperCase();
        const hexValue = base64ToHex(c.hash.value);
        if (hexValue) {
          lines.push(`PackageChecksum: ${spdxAlgo}: ${hexValue}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Base64 → 16進文字列。Node Buffer / atob 両対応。
 * SPDX 仕様準拠の checksum 出力に必要。
 */
function base64ToHex(b64: string): string | null {
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(b64, 'base64').toString('hex');
    }
    // ブラウザ fallback
    const bin = atob(b64);
    let hex = '';
    for (let i = 0; i < bin.length; i++) {
      hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  } catch {
    return null;
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
