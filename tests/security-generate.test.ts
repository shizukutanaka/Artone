/**
 * Tests for security/generate.ts — extractComponents()
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { extractComponents, type LockfileV3 } from '../security/generate';

function makeLockfile(packages: LockfileV3['packages']): LockfileV3 {
  return { name: 'artone', version: '3.0.0', packages: { '': { version: '3.0.0' } as never, ...packages } };
}

describe('extractComponents', () => {
  it('extracts a component per package with a version', () => {
    const lockfile = makeLockfile({
      'node_modules/lodash': { version: '4.17.21' },
    });
    const { components } = extractComponents(lockfile, false);
    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ name: 'lodash', version: '4.17.21' });
  });

  it('REGRESSION: dependsOn resolves to the actual installed version, not the raw semver range', () => {
    // Before fix: dependsOn was built as `${name}@${range}` directly from
    // the lockfile's declared dependency range (e.g. "^0.3.5"), which is
    // never the same string as the resolved version used everywhere else
    // (`${name}@${info.version}`) -- so no dependsOn entry could ever match
    // any real component ref, and the whole dependency graph came out
    // completely unlinked.
    const lockfile = makeLockfile({
      'node_modules/gen-mapping': {
        version: '0.3.8',
      },
      'node_modules/remapping': {
        version: '2.3.0',
        dependencies: { 'gen-mapping': '^0.3.5' },
      },
    });
    const { dependencies } = extractComponents(lockfile, false);
    const dep = dependencies.find((d) => d.ref === 'remapping@2.3.0');
    expect(dep).toBeTruthy();
    expect(dep!.dependsOn).toEqual(['gen-mapping@0.3.8']);
  });

  it('falls back to the raw range when the dependency was filtered out (e.g. dev-only, includeDev=false)', () => {
    const lockfile = makeLockfile({
      'node_modules/foo': {
        version: '1.0.0',
        dependencies: { 'dev-only-dep': '^2.0.0' },
      },
      'node_modules/dev-only-dep': {
        version: '2.5.0',
        dev: true,
      },
    });
    const { dependencies } = extractComponents(lockfile, false);
    const dep = dependencies.find((d) => d.ref === 'foo@1.0.0');
    expect(dep!.dependsOn).toEqual(['dev-only-dep@^2.0.0']);
  });

  it('prefers the shallowest (top-level) occurrence when a package is duplicated at multiple depths', () => {
    const lockfile = makeLockfile({
      'node_modules/shared': { version: '1.0.0' },
      'node_modules/foo/node_modules/shared': { version: '2.0.0' },
      'node_modules/foo': {
        version: '1.0.0',
        dependencies: { shared: '^1.0.0' },
      },
    });
    const { dependencies } = extractComponents(lockfile, false);
    const dep = dependencies.find((d) => d.ref === 'foo@1.0.0');
    expect(dep!.dependsOn).toEqual(['shared@1.0.0']);
  });

  it('excludes dev dependencies when includeDev is false', () => {
    const lockfile = makeLockfile({
      'node_modules/prod-dep': { version: '1.0.0' },
      'node_modules/dev-dep': { version: '2.0.0', dev: true },
    });
    const { components } = extractComponents(lockfile, false);
    expect(components.map((c) => c.name)).toEqual(['prod-dep']);
  });

  it('includes dev dependencies when includeDev is true', () => {
    const lockfile = makeLockfile({
      'node_modules/prod-dep': { version: '1.0.0' },
      'node_modules/dev-dep': { version: '2.0.0', dev: true },
    });
    const { components } = extractComponents(lockfile, true);
    expect(components.map((c) => c.name).sort()).toEqual(['dev-dep', 'prod-dep']);
  });
});
