/**
 * SBOM (Software Bill of Materials) 自動生成
 *
 * 使用:
 *   npm run sbom
 *
 * 出力:
 *   sbom.json   (CycloneDX 1.7)
 *   sbom.spdx   (SPDX 2.3)
 *
 * package.json + package-lock.json から依存ツリーを抽出。
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { supplyChain, type Component, type Dependency, type CVE } from './sbom';
import { osv } from './osv-client';
import { loadCVEDatabase } from './cve-database';

interface PackageJson {
  name: string;
  version: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: { url?: string } | string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface LockfileV3 {
  name: string;
  version: string;
  packages: Record<
    string,
    {
      version?: string;
      license?: string;
      integrity?: string;
      resolved?: string;
      dev?: boolean;
      dependencies?: Record<string, string>;
    }
  >;
}

function loadPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf-8')) as PackageJson;
}

function loadLockfile(path: string): LockfileV3 | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as LockfileV3;
}

/**
 * npm の integrity 値 ("sha512-base64==") を SPDX 互換の hex に変換。
 * SPDX は hex 必須、CycloneDX は base64 も hex も許容。
 */
function normalizeHash(integrity: string | undefined): { algorithm: string; value: string } | undefined {
  if (!integrity) return undefined;
  const match = integrity.match(/^([a-z0-9]+)-(.+)$/i);
  if (!match) return undefined;
  const [, alg, b64] = match;

  // base64 → hex
  try {
    const buf = Buffer.from(b64, 'base64');
    return { algorithm: alg.toUpperCase(), value: buf.toString('hex').toUpperCase() };
  } catch {
    return { algorithm: alg.toUpperCase(), value: b64 };
  }
}

export function extractComponents(lockfile: LockfileV3, includeDev: boolean): {
  components: Component[];
  dependencies: Dependency[];
} {
  const components: Component[] = [];
  const pending: Array<{ path: string; name: string; version: string; deps: Record<string, string> }> = [];
  // REGRESSION fix: `info.dependencies` on a lockfile package entry holds the
  // *declared semver range* (e.g. "^0.3.5"), not the resolved installed
  // version. Every Component/Dependency.ref elsewhere is built as
  // `name@resolvedVersion`, so a dependsOn entry built directly from the
  // range string (the old behavior) could never match any real component
  // ref -- the entire `dependencies` graph came out completely unlinked.
  // Resolve each dependency name to its actual installed version via this
  // map before building dependsOn. Prefers the shallowest (top-level)
  // occurrence of a name when npm's hoisting has deduped it there, which is
  // correct for the common case; deeply nested per-parent overrides are a
  // real but rarer divergence not attempted here (would require replicating
  // Node's full node_modules resolution walk).
  const versionsByName = new Map<string, { version: string; depth: number }>();

  for (const [path, info] of Object.entries(lockfile.packages)) {
    if (path === '') continue; // ルート除外
    if (info.dev && !includeDev) continue;
    if (!info.version) continue;

    // node_modules/foo/node_modules/bar → bar を抽出
    const match = path.match(/node_modules\/([^/]+(?:\/[^/]+)?)$/);
    if (!match) continue;
    const name = match[1].startsWith('@') ? match[1] : match[1];

    const hash = normalizeHash(info.integrity);

    components.push({
      name,
      version: info.version,
      type: 'library',
      purl: `pkg:npm/${name}@${info.version}`,
      license: info.license ?? null,
      hash,
    });

    const depth = path.split('node_modules/').length;
    const existing = versionsByName.get(name);
    if (!existing || depth < existing.depth) {
      versionsByName.set(name, { version: info.version, depth });
    }

    if (info.dependencies) {
      pending.push({ path, name, version: info.version, deps: info.dependencies });
    }
  }

  const dependencies: Dependency[] = pending.map(({ name, version, deps }) => ({
    ref: `${name}@${version}`,
    dependsOn: Object.entries(deps).map(([n, range]) => {
      const resolved = versionsByName.get(n);
      // Fallback to the raw range only if the dependency itself was
      // excluded (e.g. a dev-only sub-dependency filtered out above) --
      // should be rare for a consistent lockfile.
      return `${n}@${resolved?.version ?? range}`;
    }),
  }));

  return { components, dependencies };
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const pkg = loadPackageJson(join(cwd, 'package.json'));
  const lockfile = loadLockfile(join(cwd, 'package-lock.json'));

  console.log(`=== SBOM Generation: ${pkg.name}@${pkg.version} ===`);

  const project: Component = {
    name: pkg.name,
    version: pkg.version,
    type: 'application',
    license: pkg.license ?? 'MIT',
    description: pkg.description,
    homepage:
      typeof pkg.repository === 'object'
        ? pkg.repository.url
        : pkg.homepage ?? '',
  };

  let components: Component[] = [];
  let dependencies: Dependency[] = [];

  if (lockfile) {
    const includeDev = process.argv.includes('--include-dev');
    ({ components, dependencies } = extractComponents(lockfile, includeDev));
  } else {
    console.warn('No package-lock.json found. Generating partial SBOM.');
    const deps = pkg.dependencies ?? {};
    for (const [name, version] of Object.entries(deps)) {
      components.push({
        name,
        version: version.replace(/^[\^~]/, ''),
        type: 'library',
        purl: `pkg:npm/${name}@${version}`,
        license: null,
      });
    }
  }

  console.log(`Components: ${components.length}`);

  // CVE データソース: ローカル DB (always) + OSV (--online フラグ時)
  let cves: CVE[] = loadCVEDatabase();
  console.log(`Local CVE database: ${cves.length} known vulnerabilities`);

  if (process.argv.includes('--online')) {
    console.log('Querying OSV (api.osv.dev)...');
    try {
      const client = osv.client();
      const osvResults = await client.queryBatch(
        components.map((c) => ({ name: c.name, version: c.version })),
        'npm'
      );
      const osvCves: CVE[] = [];
      for (const cveList of osvResults.values()) osvCves.push(...cveList);
      console.log(`OSV: ${osvCves.length} additional vulnerabilities found`);
      cves = [...cves, ...osvCves];

      // OSV キャッシュをディスクに保存 (10年運用: API ダウン時の fallback)
      writeFileSync(join(cwd, 'security', '.osv-cache.json'), client.serializeCache());
    } catch (err) {
      console.warn('OSV query failed, falling back to local DB:', err);
    }
  }

  const auditor = supplyChain.auditor();
  const report = auditor.audit(project, components, dependencies, cves);

  // JSON (CycloneDX) 出力
  const sbomGenerator = supplyChain.sbom();
  writeFileSync(join(cwd, 'sbom.json'), sbomGenerator.toJSON(report.bom));

  // SPDX 出力
  writeFileSync(join(cwd, 'sbom.spdx'), sbomGenerator.toSPDX(report.bom));

  // レポート表示
  console.log('');
  console.log(auditor.formatReport(report));

  if (!report.summary.passed) {
    console.error('FAILED: Supply chain audit issues detected');
    process.exit(1);
  }

  console.log('');
  console.log('Output: sbom.json (CycloneDX 1.7), sbom.spdx (SPDX 2.3)');
}

// REGRESSION fix: main() used to run unconditionally at module load, so
// merely `import`ing this file (e.g. to unit-test extractComponents()) ran
// the full SBOM generation pipeline against the real repo -- writing
// sbom.json/sbom.spdx and potentially calling process.exit(1) as a side
// effect of an import. Guard so main() only runs when this file is the
// actual entry point (`tsx security/generate.ts` / `npm run sbom`).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
