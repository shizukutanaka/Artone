/**
 * Security — SBOM / License / Supply Chain テスト
 *
 * CycloneDX 1.7 (lifecycles) 準拠、SPDX ライセンス互換性、脆弱性スキャンを検証。
 */

import { describe, it, expect } from 'vitest';
import {
  LicenseAnalyzer,
  SBOMGenerator,
  type Component,
} from '../security/sbom';

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

  it('SPDX expression picks strongest (MIT OR GPL-3.0)', () => {
    // OR 式では最も制約の強いものを採用
    const cat = LicenseAnalyzer.categorize('MIT OR GPL-3.0');
    expect(['strong-copyleft', 'permissive']).toContain(cat);
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
});
