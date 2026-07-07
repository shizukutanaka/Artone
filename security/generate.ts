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

interface LockfileV3 {
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

function extractComponents(lockfile: LockfileV3, includeDev: boolean): {
  components: Component[];
  dependencies: Dependency[];
} {
  const components: Component[] = [];
  const dependencies: Dependency[] = [];

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

    if (info.dependencies) {
      dependencies.push({
        ref: `${name}@${info.version}`,
        dependsOn: Object.entries(info.dependencies).map(([n, v]) => `${n}@${v}`),
      });
    }
  }

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
