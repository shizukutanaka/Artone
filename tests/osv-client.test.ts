/**
 * Tests for security/osv-client.ts
 *
 * Covers ecosystem inference, CVSS→severity, OSV→CVE conversion (incl. the
 * private parseCVSSScore exercised via vectors), the online client with an
 * injected fetch, cache (de)serialization resilience, and the OfflineCVEStore
 * — including the regression: a corrupt offline cache must not crash.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  inferEcosystem,
  cvssToSeverity,
  osvToCVE,
  OSVClient,
  OfflineCVEStore,
  osv,
} from '../security/osv-client';
import type { OSVVulnerability } from '../security/osv-client';
import type { CVE } from '../security/sbom';

// ─── inferEcosystem ───────────────────────────────────────────────────────────

describe('inferEcosystem', () => {
  it('plain lowercase name → npm', () => {
    expect(inferEcosystem('lodash')).toBe('npm');
  });

  it('scoped npm package (@scope/pkg) → npm (not Go)', () => {
    expect(inferEcosystem('@babel/core')).toBe('npm');
  });

  it('owner/repo path → Go', () => {
    expect(inferEcosystem('github.com/gin-gonic/gin')).toBe('Go');
  });

  it('groupId:artifactId → Maven', () => {
    expect(inferEcosystem('org.apache.commons:commons-lang3')).toBe('Maven');
  });
});

// ─── cvssToSeverity ───────────────────────────────────────────────────────────

describe('cvssToSeverity', () => {
  it('maps the CVSS v3.1 severity bands', () => {
    expect(cvssToSeverity(9.8)).toBe('critical');
    expect(cvssToSeverity(9.0)).toBe('critical');
    expect(cvssToSeverity(8.9)).toBe('high');
    expect(cvssToSeverity(7.0)).toBe('high');
    expect(cvssToSeverity(6.9)).toBe('medium');
    expect(cvssToSeverity(4.0)).toBe('medium');
    expect(cvssToSeverity(3.9)).toBe('low');
    expect(cvssToSeverity(0)).toBe('low');
  });
});

// ─── osvToCVE (+ parseCVSSScore via vectors) ─────────────────────────────────

function makeOSV(over: Partial<OSVVulnerability> = {}): OSVVulnerability {
  return {
    id: 'OSV-TEST-1',
    modified: '2024-01-01T00:00:00Z',
    summary: 'Test vuln',
    affected: [
      {
        package: { name: 'pkg', ecosystem: 'npm' },
        ranges: [
          { type: 'SEMVER', events: [{ introduced: '1.0.0' }, { fixed: '1.2.3' }] },
        ],
      },
    ],
    ...over,
  };
}

describe('osvToCVE', () => {
  it('builds a SEMVER affected range and fixedIn', () => {
    const cve = osvToCVE(makeOSV(), 'pkg');
    expect(cve.id).toBe('OSV-TEST-1');
    expect(cve.package).toBe('pkg');
    expect(cve.affectedVersions).toBe('>=1.0.0 <1.2.3');
    expect(cve.fixedIn).toBe('1.2.3');
  });

  it('omits introduced==0 from the range', () => {
    const cve = osvToCVE(makeOSV({
      affected: [{ package: { name: 'pkg', ecosystem: 'npm' },
        ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '2.0.0' }] }] }],
    }), 'pkg');
    expect(cve.affectedVersions).toBe('<2.0.0');
  });

  it('falls back to explicit versions[] joined by ||', () => {
    const cve = osvToCVE(makeOSV({
      affected: [{ package: { name: 'pkg', ecosystem: 'npm' }, versions: ['1.0.0', '1.0.1'] }],
    }), 'pkg');
    expect(cve.affectedVersions).toBe('1.0.0||1.0.1');
  });

  it('derives severity from a direct CVSS number string', () => {
    const cve = osvToCVE(makeOSV({ severity: [{ type: 'CVSS_V3', score: '9.8' }] }), 'pkg');
    expect(cve.cvss).toBeCloseTo(9.8, 5);
    expect(cve.severity).toBe('critical');
  });

  it('computes a base score from a full CVSS v3.1 vector (≈9.8)', () => {
    const vec = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
    const cve = osvToCVE(makeOSV({ severity: [{ type: 'CVSS_V3', score: vec }] }), 'pkg');
    expect(cve.cvss).toBeGreaterThan(9.5);
    expect(cve.severity).toBe('critical');
  });

  it('a low-impact vector yields a lower severity than a high-impact one', () => {
    const high = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';
    const low  = 'CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N';
    const hi = osvToCVE(makeOSV({ severity: [{ type: 'CVSS_V3', score: high }] }), 'pkg').cvss!;
    const lo = osvToCVE(makeOSV({ severity: [{ type: 'CVSS_V3', score: low }] }), 'pkg').cvss!;
    expect(hi).toBeGreaterThan(lo);
  });

  it('uses database_specific.severity when no CVSS present', () => {
    const cve = osvToCVE(makeOSV({ severity: undefined, database_specific: { severity: 'CRITICAL' } }), 'pkg');
    expect(cve.severity).toBe('critical');
  });

  it('defaults description when summary/details missing', () => {
    const cve = osvToCVE(makeOSV({ summary: undefined, details: undefined }), 'pkg');
    expect(cve.description).toBe('No description');
  });
});

// ─── OSVClient (injected fetch) ──────────────────────────────────────────────

function fakeFetch(payload: unknown, ok = true, status = 200): typeof fetch {
  return (async () => ({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe('OSVClient.query', () => {
  it('returns vulns from the API and caches them', async () => {
    const vuln = makeOSV();
    let calls = 0;
    const fetchFn = (async () => { calls++; return {
      ok: true, status: 200, statusText: 'OK', json: async () => ({ vulns: [vuln] }),
    }; }) as unknown as typeof fetch;
    const client = new OSVClient({ fetch: fetchFn });

    const r1 = await client.query('pkg', '1.0.0');
    expect(r1).toHaveLength(1);
    const r2 = await client.query('pkg', '1.0.0');
    expect(r2).toHaveLength(1);
    expect(calls).toBe(1); // second call served from cache
  });

  it('non-strict mode returns [] and counts failures on HTTP error', async () => {
    const client = new OSVClient({ fetch: fakeFetch({}, false, 500), strict: false });
    const r = await client.query('pkg', '1.0.0');
    expect(r).toEqual([]);
    expect(client.getFailedQueries()).toBe(1);
  });

  it('strict mode throws on HTTP error', async () => {
    const client = new OSVClient({ fetch: fakeFetch({}, false, 500), strict: true });
    await expect(client.query('pkg', '1.0.0')).rejects.toThrow(/OSV API 500/);
  });

  it('handles empty vulns field', async () => {
    const client = new OSVClient({ fetch: fakeFetch({}) });
    expect(await client.query('pkg', '1.0.0')).toEqual([]);
  });
});

describe('OSVClient cache (de)serialization', () => {
  it('round-trips the cache', async () => {
    const client = new OSVClient({ fetch: fakeFetch({ vulns: [makeOSV()] }) });
    await client.query('pkg', '1.0.0');
    const json = client.serializeCache();

    const restored = new OSVClient({ fetch: fakeFetch({}) });
    const { loaded } = restored.loadCache(json);
    expect(loaded).toBe(1);
  });

  it('loadCache ignores corrupt JSON without throwing', () => {
    const client = new OSVClient({ fetch: fakeFetch({}) });
    expect(() => client.loadCache('{ broken')).not.toThrow();
    expect(client.loadCache('{ broken')).toEqual({ loaded: 0, skipped: 0 });
  });

  it('loadCache skips non-array entries', () => {
    const client = new OSVClient({ fetch: fakeFetch({}) });
    const { loaded, skipped } = client.loadCache(JSON.stringify({ good: [], bad: 42 }));
    expect(loaded).toBe(1);
    expect(skipped).toBe(1);
  });
});

// ─── OfflineCVEStore ──────────────────────────────────────────────────────────

const sampleCVE: CVE = {
  id: 'CVE-2024-0001',
  package: 'pkg',
  affectedVersions: '<1.0.0',
  severity: 'high',
  description: 'x',
  fixedIn: '1.0.0',
  cvss: 7.5,
};

describe('OfflineCVEStore', () => {
  it('add() de-duplicates by id', () => {
    const store = new OfflineCVEStore();
    store.add([sampleCVE]);
    store.add([sampleCVE]); // duplicate id
    expect(store.size()).toBe(1);
  });

  it('query() filters by package', () => {
    const store = new OfflineCVEStore();
    store.add([sampleCVE, { ...sampleCVE, id: 'CVE-2', package: 'other' }]);
    expect(store.query('pkg')).toHaveLength(1);
    expect(store.query('other')).toHaveLength(1);
    expect(store.query('nope')).toHaveLength(0);
  });

  it('serialize/load round-trips', () => {
    const store = new OfflineCVEStore();
    store.add([sampleCVE]);
    const json = store.serialize();

    const restored = new OfflineCVEStore();
    restored.load(json);
    expect(restored.size()).toBe(1);
    expect(restored.query('pkg')[0].id).toBe('CVE-2024-0001');
  });

  it('all() returns a copy (mutating it does not affect the store)', () => {
    const store = new OfflineCVEStore();
    store.add([sampleCVE]);
    const copy = store.all();
    copy.push({ ...sampleCVE, id: 'CVE-X' });
    expect(store.size()).toBe(1);
  });

  it('REGRESSION: load() ignores corrupt JSON without throwing', () => {
    const store = new OfflineCVEStore();
    store.add([sampleCVE]);
    expect(() => store.load('{ not json')).not.toThrow();
    // existing data preserved, queries still work
    expect(store.size()).toBe(1);
    expect(() => store.all()).not.toThrow();
  });

  it('REGRESSION: load() ignores objects missing the cves array', () => {
    const store = new OfflineCVEStore();
    expect(() => store.load(JSON.stringify({ wrong: [] }))).not.toThrow();
    // db remains a valid (empty) array — query must not crash
    expect(store.query('pkg')).toEqual([]);
    expect(store.size()).toBe(0);
  });
});

// ─── factory ──────────────────────────────────────────────────────────────────

describe('osv factory', () => {
  it('creates client and store instances', () => {
    expect(osv.client({ fetch: fakeFetch({}) })).toBeInstanceOf(OSVClient);
    expect(osv.store()).toBeInstanceOf(OfflineCVEStore);
  });

  it('re-exports cvssToSeverity and osvToCVE', () => {
    expect(osv.cvssToSeverity(9.5)).toBe('critical');
    expect(osv.osvToCVE(makeOSV(), 'pkg').id).toBe('OSV-TEST-1');
  });
});
