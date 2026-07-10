/**
 * Security — SBOM / License / Supply Chain テスト
 *
 * CycloneDX 1.7 (lifecycles) 準拠、SPDX ライセンス互換性、脆弱性スキャンを検証。
 */

import { describe, it, expect } from 'vitest';
import {
  LicenseAnalyzer,
  SBOMGenerator,
  VulnerabilityScanner,
  SupplyChainAuditor,
  type Component,
  type CVE,
} from '../security/sbom';
import { loadCVEDatabase, findCVEsForPackage, normalizeVersion, KNOWN_CVES } from '../security/cve-database';

const lib = (name: string, version: string, license: string | null): Component => ({
  name, version, type: 'library', license,
});

describe('LicenseAnalyzer — categorize', () => {
  it('MIT is permissive', () => {
    expect(LicenseAnalyzer.categorize('MIT')).toBe('permissive');
  });

  it('Apache-2.0 is permissive', () => {
    expect(LicenseAnalyzer.categorize('Apache-2.0')).toBe('permissive');
  });

  it('GPL-3.0 is strong-copyleft', () => {
    expect(LicenseAnalyzer.categorize('GPL-3.0')).toBe('strong-copyleft');
  });

  it('null license is unknown', () => {
    expect(LicenseAnalyzer.categorize(null)).toBe('unknown');
  });

  it('REGRESSION: pure OR expression picks the WEAKEST (most permissive) option, not the strongest', () => {
    // Before fix: OR was tokenized identically to AND and the strongest
    // category always won, so "MIT OR GPL-3.0" categorized as
    // strong-copyleft. But OR is a licensee's CHOICE between alternatives --
    // MIT-or-GPL-3.0 means the dependency is validly usable under MIT alone,
    // so the correct category is 'permissive'.
    expect(LicenseAnalyzer.categorize('MIT OR GPL-3.0')).toBe('permissive');
    expect(LicenseAnalyzer.categorize('(MIT OR Apache-2.0)')).toBe('permissive');
  });

  it('AND combination still picks the strongest (every term must be satisfied)', () => {
    expect(LicenseAnalyzer.categorize('MIT AND GPL-3.0')).toBe('strong-copyleft');
  });

  it('does not false-match substring (MITigation)', () => {
    // "MITigation" は MIT にマッチすべきでない (単語境界)
    const cat = LicenseAnalyzer.categorize('MITigation-License');
    expect(cat).toBe('unknown');
  });
});

describe('LicenseAnalyzer — compatible', () => {
  it('MIT project allows MIT dependency', () => {
    const result = LicenseAnalyzer.compatible('MIT', 'MIT');
    expect(result.compatible).toBe(true);
  });

  it('MIT project flags GPL dependency', () => {
    const result = LicenseAnalyzer.compatible('MIT', 'GPL-3.0');
    expect(result.compatible).toBe(false);
    expect(result.warning).toBeTruthy();
  });

  it('unknown dependency license is flagged', () => {
    const result = LicenseAnalyzer.compatible('MIT', null);
    expect(result.compatible).toBe(false);
  });

  it('REGRESSION: a dual-licensed (MIT OR GPL-3.0) dependency is compatible with an MIT project', () => {
    // Real-world dual-licensing pattern: the dependency may be used under
    // MIT alone, so it must not be flagged as a GPL conflict.
    const result = LicenseAnalyzer.compatible('MIT', 'MIT OR GPL-3.0');
    expect(result.compatible).toBe(true);
  });
});

describe('SBOMGenerator — CycloneDX 1.7', () => {
  const gen = new SBOMGenerator();
  const project = lib('artone', '3.0.0', 'MIT');
  const components = [lib('react', '18.2.0', 'MIT'), lib('lodash', '4.17.21', 'MIT')];

  it('produces CycloneDX 1.7 spec version', () => {
    const bom = gen.generate(project, components, []);
    expect(bom.bomFormat).toBe('CycloneDX');
    expect(bom.specVersion).toBe('1.7');
  });

  it('includes lifecycles metadata (CycloneDX 1.7 feature)', () => {
    const bom = gen.generate(project, components, []);
    expect(bom.metadata.lifecycles).toBeTruthy();
    expect(bom.metadata.lifecycles?.[0].phase).toBe('build');
  });

  it('has valid urn:uuid serial number', () => {
    const bom = gen.generate(project, components, []);
    expect(bom.serialNumber).toMatch(/^urn:uuid:[0-9a-f-]+$/);
  });

  it('includes all components', () => {
    const bom = gen.generate(project, components, []);
    expect(bom.components.length).toBe(2);
    expect(bom.components.map((c) => c.name)).toContain('react');
  });

  it('toJSON produces valid JSON', () => {
    const bom = gen.generate(project, components, []);
    const json = gen.toJSON(bom);
    const parsed = JSON.parse(json);
    expect(parsed.specVersion).toBe('1.7');
    expect(parsed.metadata.lifecycles).toBeTruthy();
  });

  it('toSPDX produces SPDX 2.3 format', () => {
    const bom = gen.generate(project, components, []);
    const spdx = gen.toSPDX(bom);
    expect(spdx).toContain('SPDXVersion: SPDX-2.3');
    expect(spdx).toContain('PackageName: react');
  });

  it('timestamp is valid ISO 8601', () => {
    const bom = gen.generate(project, components, []);
    expect(() => new Date(bom.metadata.timestamp).toISOString()).not.toThrow();
    expect(bom.metadata.timestamp).toBe(new Date(bom.metadata.timestamp).toISOString());
  });

  it('toSPDX emits PackageChecksum for sha256 hash', () => {
    // Component.hash.value is hex (generate.ts's normalizeHash already
    // converts npm's base64 integrity value at construction time) — do not
    // construct it as base64 here, or the test exercises the opposite
    // encoding from what the real pipeline produces.
    const hashed: Component = {
      name: 'react', version: '18.2.0', type: 'library', license: 'MIT',
      hash: { algorithm: 'sha256', value: 'deadbeef' },
    };
    const bom = gen.generate(project, [hashed], []);
    const spdx = gen.toSPDX(bom);
    expect(spdx).toContain('PackageChecksum: SHA256: deadbeef');
  });

  it('toSPDX emits PackageChecksum for sha1 hash with uppercase algo', () => {
    const hashed: Component = {
      name: 'lodash', version: '4.17.21', type: 'library', license: 'MIT',
      hash: { algorithm: 'sha1', value: 'cafebabe' },
    };
    const bom = gen.generate(project, [hashed], []);
    const spdx = gen.toSPDX(bom);
    expect(spdx).toContain('PackageChecksum: SHA1: cafebabe');
  });

  it('REGRESSION: does not double-decode an already-hex hash value (was corrupting every checksum)', () => {
    // Before fix: toSPDX ran c.hash.value through base64ToHex() again, even
    // though normalizeHash() already produced hex. Hex digits happen to also
    // be valid base64 characters, so this didn't throw — it silently decoded
    // garbage bytes into every PackageChecksum line in the real npm-audit →
    // SBOM pipeline.
    const hashed: Component = {
      name: 'react', version: '18.2.0', type: 'library', license: 'MIT',
      hash: { algorithm: 'sha512', value: 'DEADBEEFCAFEBABE1234567890ABCDEF' },
    };
    const bom = gen.generate(project, [hashed], []);
    const spdx = gen.toSPDX(bom);
    expect(spdx).toContain('PackageChecksum: SHA512: deadbeefcafebabe1234567890abcdef');
  });

  it('toSPDX omits PackageChecksum for a non-hex hash value', () => {
    const hashed: Component = {
      name: 'react', version: '18.2.0', type: 'library', license: 'MIT',
      hash: { algorithm: 'sha256', value: '!!!not-hex!!!' },
    };
    const bom = gen.generate(project, [hashed], []);
    const spdx = gen.toSPDX(bom);
    expect(spdx).toContain('PackageName: react');
    expect(spdx).not.toContain('PackageChecksum');
  });
});

describe('VulnerabilityScanner', () => {
  const scanner = new VulnerabilityScanner();
  const cve: CVE = {
    id: 'CVE-2023-0001',
    package: 'lodash',
    affectedVersions: '<4.17.22',
    severity: 'high',
    description: 'Prototype pollution',
    fixedIn: '4.17.22',
  };

  it('detects vulnerability for matching component', () => {
    scanner.loadDatabase([cve]);
    const reports = scanner.scan([{ name: 'lodash', version: '4.17.21', type: 'library', license: 'MIT' }]);
    expect(reports).toHaveLength(1);
    expect(reports[0].vulnerabilities[0].id).toBe('CVE-2023-0001');
  });

  it('returns empty for non-matching version', () => {
    scanner.loadDatabase([cve]);
    const reports = scanner.scan([{ name: 'lodash', version: '4.17.22', type: 'library', license: 'MIT' }]);
    expect(reports).toHaveLength(0);
  });

  it('returns empty when no CVEs loaded', () => {
    const fresh = new VulnerabilityScanner();
    const reports = fresh.scan([{ name: 'lodash', version: '4.17.21', type: 'library', license: 'MIT' }]);
    expect(reports).toHaveLength(0);
  });

  it('REGRESSION: detects a version inside a hyphen range ("1.0.0 - 2.0.0")', () => {
    // Before fix: a hyphen range fell through to the whitespace-based AND
    // split, producing tokens ["1.0.0", "-", "2.0.0"] -- the literal "-"
    // token can never equal any real version, so `parts.every(...)` was
    // always false and the range matched NOTHING, for any version. A CVE
    // declared this way would silently never be flagged -- a fail-open
    // false negative in a vulnerability scanner.
    const hyphenCve: CVE = {
      id: 'CVE-2024-0002',
      package: 'example-pkg',
      affectedVersions: '1.0.0 - 2.0.0',
      severity: 'critical',
      description: 'Test hyphen range',
    };
    const fresh = new VulnerabilityScanner();
    fresh.loadDatabase([hyphenCve]);
    const inRange = fresh.scan([{ name: 'example-pkg', version: '1.5.0', type: 'library', license: 'MIT' }]);
    expect(inRange).toHaveLength(1);
    const belowRange = fresh.scan([{ name: 'example-pkg', version: '0.9.0', type: 'library', license: 'MIT' }]);
    expect(belowRange).toHaveLength(0);
    const aboveRange = fresh.scan([{ name: 'example-pkg', version: '2.0.1', type: 'library', license: 'MIT' }]);
    expect(aboveRange).toHaveLength(0);
    // Boundaries are inclusive.
    const atLowerBound = fresh.scan([{ name: 'example-pkg', version: '1.0.0', type: 'library', license: 'MIT' }]);
    expect(atLowerBound).toHaveLength(1);
    const atUpperBound = fresh.scan([{ name: 'example-pkg', version: '2.0.0', type: 'library', license: 'MIT' }]);
    expect(atUpperBound).toHaveLength(1);
  });
});

describe('SupplyChainAuditor — audit + formatReport', () => {
  const auditor = new SupplyChainAuditor();
  const project: Component = { name: 'artone', version: '3.0.0', type: 'application', license: 'MIT' };

  it('audit passes for clean components', () => {
    const report = auditor.audit(project, [
      { name: 'react', version: '18.2.0', type: 'library', license: 'MIT' },
    ], []);
    expect(report.summary.passed).toBe(true);
    expect(report.summary.criticalVulns).toBe(0);
    expect(report.summary.licenseIssues).toBe(0);
  });

  it('audit fails when GPL dependency conflicts with MIT project', () => {
    const report = auditor.audit(project, [
      { name: 'gpl-lib', version: '1.0.0', type: 'library', license: 'GPL-3.0' },
    ], []);
    expect(report.summary.passed).toBe(false);
    expect(report.summary.licenseIssues).toBeGreaterThan(0);
    expect(report.licenseConflicts[0].component).toContain('gpl-lib');
  });

  it('audit detects critical CVE and marks failed', () => {
    const cve: CVE = {
      id: 'CVE-2024-9999',
      package: 'vuln-pkg',
      affectedVersions: '1.0.0',
      severity: 'critical',
      description: 'RCE vulnerability',
    };
    const report = auditor.audit(project, [
      { name: 'vuln-pkg', version: '1.0.0', type: 'library', license: 'MIT' },
    ], [], [cve]);
    expect(report.summary.criticalVulns).toBe(1);
  });

  it('formatReport includes PASS status for clean report', () => {
    const report = auditor.audit(project, [
      { name: 'react', version: '18.2.0', type: 'library', license: 'MIT' },
    ], []);
    const text = auditor.formatReport(report);
    expect(text).toContain('=== Supply Chain Audit ===');
    expect(text).toContain('Status: PASS');
    expect(text).toContain('Components: 1');
    expect(text).toContain('License Summary:');
  });

  it('formatReport includes FAIL status and license conflicts', () => {
    const report = auditor.audit(project, [
      { name: 'gpl-lib', version: '1.0.0', type: 'library', license: 'GPL-3.0' },
    ], []);
    const text = auditor.formatReport(report);
    expect(text).toContain('Status: FAIL');
    expect(text).toContain('License Conflicts');
    expect(text).toContain('gpl-lib@1.0.0');
  });

  it('formatReport shows vulnerability with fixedIn', () => {
    const cve: CVE = {
      id: 'CVE-2024-0001',
      package: 'lodash',
      affectedVersions: '<4.17.22',
      severity: 'high',
      description: 'Prototype pollution',
      fixedIn: '4.17.22',
    };
    const report = auditor.audit(project, [
      { name: 'lodash', version: '4.17.21', type: 'library', license: 'MIT' },
    ], [], [cve]);
    const text = auditor.formatReport(report);
    expect(text).toContain('[HIGH]');
    expect(text).toContain('CVE-2024-0001');
    expect(text).toContain('Fix: upgrade to 4.17.22');
  });

  it('formatReport shows vulnerability without fixedIn', () => {
    const cve: CVE = {
      id: 'CVE-2024-0002',
      package: 'lodash',
      affectedVersions: '4.17.21',
      severity: 'medium',
      description: 'Some issue',
    };
    const report = auditor.audit(project, [
      { name: 'lodash', version: '4.17.21', type: 'library', license: 'MIT' },
    ], [], [cve]);
    const text = auditor.formatReport(report);
    expect(text).toContain('[MEDIUM]');
    expect(text).not.toContain('Fix: upgrade');
  });
});

describe('CVE Database', () => {
  it('loadCVEDatabase returns the known CVEs array', () => {
    const cves = loadCVEDatabase();
    expect(cves).toBe(KNOWN_CVES);
    expect(cves.length).toBeGreaterThan(0);
  });

  it('all entries have required fields', () => {
    for (const cve of KNOWN_CVES) {
      expect(cve.id).toMatch(/^CVE-/);
      expect(cve.package).toBeTruthy();
      expect(['low', 'medium', 'high', 'critical']).toContain(cve.severity);
    }
  });

  it('findCVEsForPackage returns matching entries', () => {
    const results = findCVEsForPackage('axios');
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.package).toBe('axios');
    }
  });

  it('findCVEsForPackage returns empty for unknown package', () => {
    expect(findCVEsForPackage('nonexistent-package-xyz')).toEqual([]);
  });

  it('normalizeVersion strips v prefix', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
  });

  it('normalizeVersion strips ^ prefix', () => {
    expect(normalizeVersion('^1.2.3')).toBe('1.2.3');
  });

  it('normalizeVersion strips ~ prefix', () => {
    expect(normalizeVersion('~1.2.3')).toBe('1.2.3');
  });

  it('normalizeVersion leaves plain version unchanged', () => {
    expect(normalizeVersion('1.2.3')).toBe('1.2.3');
  });
});
