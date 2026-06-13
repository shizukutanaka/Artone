/**
 * LUT Manager Tests
 * # AI generated (reviewed)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LUTManager, type LUT } from '../color/lut-manager';

// ─── helpers ───────────────────────────────────────────────────

function makeLUT(overrides: Partial<LUT> = {}): LUT {
  return {
    id: 'lut-1',
    name: 'Test LUT',
    filename: 'test.cube',
    format: 'cube',
    size: 2,
    // 2×2×2 identity-like LUT (B-slow, G-mid, R-fast, values are [R,G,B,…])
    data: new Float32Array([
      0, 0, 0,   1, 0, 0,   0, 1, 0,   1, 1, 0,
      0, 0, 1,   1, 0, 1,   0, 1, 1,   1, 1, 1,
    ]),
    category: 'custom',
    favorite: false,
    metadata: {},
    ...overrides,
  };
}

function addLUT(lm: LUTManager, lut: LUT): void {
  (lm as unknown as { luts: Map<string, LUT> }).luts.set(lut.id, lut);
}

/** jsdom's File lacks .text(); this wrapper injects it. */
function makeFile(content: string, name: string): File {
  const file = new File([content], name);
  if (typeof (file as unknown as { text?: unknown }).text !== 'function') {
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(content) });
  }
  return file;
}

function mockThumbnail(lm: LUTManager): void {
  vi.spyOn(
    lm as unknown as { generateThumbnail(l: LUT): Promise<string> },
    'generateThumbnail',
  ).mockResolvedValue('data:image/jpeg;base64,test');
}

// ─── Category Management ───────────────────────────────────────

describe('LUTManager — category management', () => {
  let lm: LUTManager;

  beforeEach(() => { lm = new LUTManager(); });

  it('returns 6 default categories', () => {
    const cats = lm.getCategories();
    expect(cats).toHaveLength(6);
    const ids = cats.map(c => c.id);
    expect(ids).toContain('cinematic');
    expect(ids).toContain('film');
    expect(ids).toContain('bw');
    expect(ids).toContain('creative');
    expect(ids).toContain('correction');
    expect(ids).toContain('custom');
  });

  it('createCategory adds a new category', () => {
    const cat = lm.createCategory('My Colors', '#FF0000');
    expect(cat.name).toBe('My Colors');
    expect(cat.color).toBe('#FF0000');
    expect(cat.id).toBeTruthy();
    expect(lm.getCategories()).toHaveLength(7);
  });

  it('createCategory uses default color when omitted', () => {
    const cat = lm.createCategory('Untitled');
    expect(cat.color).toBe('#666666');
  });

  it('deleteCategory removes it and migrates LUTs to custom', () => {
    const lut = makeLUT({ id: 'a', category: 'cinematic' });
    addLUT(lm, lut);
    lm.deleteCategory('cinematic');
    expect(lm.getCategories().find(c => c.id === 'cinematic')).toBeUndefined();
    expect(lm.getLUT('a')?.category).toBe('custom');
  });

  it('deleteCategory does not affect LUTs in other categories', () => {
    addLUT(lm, makeLUT({ id: 'b', category: 'film' }));
    lm.deleteCategory('cinematic');
    expect(lm.getLUT('b')?.category).toBe('film');
  });

  it('deleteCategory on a non-existent category is a no-op', () => {
    expect(() => lm.deleteCategory('ghost')).not.toThrow();
    expect(lm.getCategories()).toHaveLength(6);
  });

  it('setCategory moves a LUT to a valid category', () => {
    addLUT(lm, makeLUT({ id: 'c', category: 'custom' }));
    lm.setCategory('c', 'cinematic');
    expect(lm.getLUT('c')?.category).toBe('cinematic');
  });

  it('setCategory is a no-op for unknown category', () => {
    addLUT(lm, makeLUT({ id: 'd', category: 'custom' }));
    lm.setCategory('d', 'nonexistent');
    expect(lm.getLUT('d')?.category).toBe('custom');
  });

  it('setCategory is a no-op for unknown LUT id', () => {
    expect(() => lm.setCategory('ghost', 'cinematic')).not.toThrow();
  });

  it('createCategory notifies listeners', () => {
    const spy = vi.fn();
    lm.subscribe(spy);
    lm.createCategory('X');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('deleteCategory notifies listeners', () => {
    const spy = vi.fn();
    lm.subscribe(spy);
    lm.deleteCategory('bw');
    expect(spy).toHaveBeenCalledOnce();
  });
});

// ─── LUT CRUD ─────────────────────────────────────────────────

describe('LUTManager — LUT CRUD', () => {
  let lm: LUTManager;

  beforeEach(() => { lm = new LUTManager(); });

  it('getLUT returns undefined for unknown id', () => {
    expect(lm.getLUT('nope')).toBeUndefined();
  });

  it('getAllLUTs returns empty array initially', () => {
    expect(lm.getAllLUTs()).toEqual([]);
  });

  it('getLUTsByCategory returns empty array initially', () => {
    expect(lm.getLUTsByCategory('cinematic')).toEqual([]);
  });

  it('getFavorites returns empty array initially', () => {
    expect(lm.getFavorites()).toEqual([]);
  });

  it('getLUT returns the LUT after adding', () => {
    const lut = makeLUT();
    addLUT(lm, lut);
    expect(lm.getLUT('lut-1')).toEqual(lut);
  });

  it('getAllLUTs returns all added LUTs', () => {
    addLUT(lm, makeLUT({ id: 'a', name: 'A' }));
    addLUT(lm, makeLUT({ id: 'b', name: 'B' }));
    expect(lm.getAllLUTs()).toHaveLength(2);
    expect(lm.getAllLUTs().map(l => l.id).sort()).toEqual(['a', 'b']);
  });

  it('getLUTsByCategory filters by category', () => {
    addLUT(lm, makeLUT({ id: 'a', category: 'cinematic' }));
    addLUT(lm, makeLUT({ id: 'b', category: 'film' }));
    const cinematic = lm.getLUTsByCategory('cinematic');
    expect(cinematic).toHaveLength(1);
    expect(cinematic[0].id).toBe('a');
    expect(lm.getLUTsByCategory('film')).toHaveLength(1);
  });

  it('getFavorites returns only favorited LUTs', () => {
    addLUT(lm, makeLUT({ id: 'a', favorite: false }));
    addLUT(lm, makeLUT({ id: 'b', favorite: true }));
    const favs = lm.getFavorites();
    expect(favs).toHaveLength(1);
    expect(favs[0].id).toBe('b');
  });

  it('updateLUT merges partial updates', () => {
    addLUT(lm, makeLUT({ id: 'x', name: 'Old' }));
    lm.updateLUT('x', { name: 'New' });
    expect(lm.getLUT('x')?.name).toBe('New');
  });

  it('updateLUT does not throw for unknown id', () => {
    expect(() => lm.updateLUT('ghost', { name: 'X' })).not.toThrow();
  });

  it('toggleFavorite flips false → true', () => {
    addLUT(lm, makeLUT({ id: 'x', favorite: false }));
    lm.toggleFavorite('x');
    expect(lm.getLUT('x')?.favorite).toBe(true);
  });

  it('toggleFavorite flips true → false', () => {
    addLUT(lm, makeLUT({ id: 'x', favorite: true }));
    lm.toggleFavorite('x');
    expect(lm.getLUT('x')?.favorite).toBe(false);
  });

  it('toggleFavorite does not throw for unknown id', () => {
    expect(() => lm.toggleFavorite('ghost')).not.toThrow();
  });

  it('deleteLUT removes the LUT', () => {
    addLUT(lm, makeLUT());
    lm.deleteLUT('lut-1');
    expect(lm.getLUT('lut-1')).toBeUndefined();
    expect(lm.getAllLUTs()).toHaveLength(0);
  });

  it('deleteLUT notifies listeners', () => {
    addLUT(lm, makeLUT());
    const spy = vi.fn();
    lm.subscribe(spy);
    lm.deleteLUT('lut-1');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('updateLUT notifies listeners', () => {
    addLUT(lm, makeLUT());
    const spy = vi.fn();
    lm.subscribe(spy);
    lm.updateLUT('lut-1', { name: 'Updated' });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('toggleFavorite notifies listeners', () => {
    addLUT(lm, makeLUT());
    const spy = vi.fn();
    lm.subscribe(spy);
    lm.toggleFavorite('lut-1');
    expect(spy).toHaveBeenCalledOnce();
  });
});

// ─── Subscribe / Unsubscribe ───────────────────────────────────

describe('LUTManager — subscribe / unsubscribe', () => {
  it('subscribe returns an unsubscribe function that stops notifications', () => {
    const lm = new LUTManager();
    const spy = vi.fn();
    const unsub = lm.subscribe(spy);
    lm.createCategory('X');
    expect(spy).toHaveBeenCalledOnce();
    unsub();
    lm.createCategory('Y');
    expect(spy).toHaveBeenCalledOnce(); // still once
  });

  it('multiple listeners all receive notifications', () => {
    const lm = new LUTManager();
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    lm.subscribe(spy1);
    lm.subscribe(spy2);
    addLUT(lm, makeLUT());
    lm.deleteLUT('lut-1');
    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).toHaveBeenCalledOnce();
  });
});

// ─── Export ────────────────────────────────────────────────────

describe('LUTManager — exportLUT', () => {
  let lm: LUTManager;

  beforeEach(() => {
    lm = new LUTManager();
    addLUT(lm, makeLUT({ id: 'eid', name: 'Export Test', size: 2 }));
  });

  it('returns empty string for unknown id (cube)', () => {
    expect(lm.exportLUT('ghost')).toBe('');
  });

  it('returns empty string for unknown id (3dl)', () => {
    expect(lm.exportLUT('ghost', '3dl')).toBe('');
  });

  it('defaults to cube format', () => {
    expect(lm.exportLUT('eid')).toContain('LUT_3D_SIZE');
  });

  it('cube output contains TITLE and LUT_3D_SIZE', () => {
    const out = lm.exportLUT('eid', 'cube');
    expect(out).toContain('TITLE "Export Test"');
    expect(out).toContain('LUT_3D_SIZE 2');
  });

  it('cube output has exactly 8 data lines for size=2', () => {
    const out = lm.exportLUT('eid', 'cube');
    const dataLines = out.split('\n').filter(l => /^[\d]/.test(l.trim()) && l.includes(' '));
    expect(dataLines).toHaveLength(8);
  });

  it('cube data lines each have 3 float values', () => {
    const out = lm.exportLUT('eid', 'cube');
    const dataLines = out.split('\n').filter(l => /^[\d]/.test(l.trim()) && l.includes(' '));
    for (const line of dataLines) {
      const parts = line.trim().split(/\s+/);
      expect(parts).toHaveLength(3);
      expect(parts.every(p => !isNaN(Number(p)))).toBe(true);
    }
  });

  it('3dl output starts with Mesh header for size=2', () => {
    const out = lm.exportLUT('eid', '3dl');
    expect(out.startsWith('Mesh 2 2 2')).toBe(true);
  });

  it('3dl output has 1 header + 8 data lines for size=2', () => {
    const out = lm.exportLUT('eid', '3dl');
    const lines = out.split('\n');
    expect(lines).toHaveLength(9);
  });

  it('3dl data values are 12-bit integers in [0, 4095]', () => {
    const out = lm.exportLUT('eid', '3dl');
    const dataLines = out.split('\n').slice(1);
    for (const line of dataLines) {
      const parts = line.trim().split(/\s+/).map(Number);
      expect(parts).toHaveLength(3);
      for (const v of parts) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(4095);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});

// ─── Import / parseCube ─────────────────────────────────────────

const VALID_CUBE_2 = [
  '# Test LUT',
  'TITLE "My LUT"',
  'LUT_3D_SIZE 2',
  '0.0 0.0 0.0',
  '1.0 0.0 0.0',
  '0.0 1.0 0.0',
  '1.0 1.0 0.0',
  '0.0 0.0 1.0',
  '1.0 0.0 1.0',
  '0.0 1.0 1.0',
  '1.0 1.0 1.0',
].join('\n');

const VALID_3DL_2 = [
  'Mesh 2 2 2',
  '0 0 0',
  '4095 0 0',
  '0 4095 0',
  '4095 4095 0',
  '0 0 4095',
  '4095 0 4095',
  '0 4095 4095',
  '4095 4095 4095',
].join('\n');

describe('LUTManager — importLUT / parseCube', () => {
  let lm: LUTManager;

  beforeEach(() => {
    lm = new LUTManager();
    mockThumbnail(lm);
  });

  it('rejects unsupported file extensions', async () => {
    expect(await lm.importLUT(makeFile('data', 'lut.mga'))).toBeNull();
  });

  it('rejects an unknown extension silently', async () => {
    expect(await lm.importLUT(makeFile('data', 'lut.csp'))).toBeNull();
  });

  it('parses a valid .cube file', async () => {
    const lut = await lm.importLUT(makeFile(VALID_CUBE_2, 'test.cube'));
    expect(lut).not.toBeNull();
    expect(lut!.name).toBe('My LUT');
    expect(lut!.format).toBe('cube');
    expect(lut!.size).toBe(2);
    expect(lut!.data).toHaveLength(24); // 2³ × 3
  });

  it('stores the parsed cube LUT in the manager', async () => {
    const lut = await lm.importLUT(makeFile(VALID_CUBE_2, 'test.cube'));
    expect(lm.getLUT(lut!.id)).toBe(lut);
  });

  it('parses a valid .3dl file', async () => {
    const lut = await lm.importLUT(makeFile(VALID_3DL_2, 'test.3dl'));
    expect(lut).not.toBeNull();
    expect(lut!.format).toBe('3dl');
    expect(lut!.size).toBe(2);
    expect(lut!.data).toHaveLength(24);
  });

  it('cube parse handles DOMAIN_MIN / DOMAIN_MAX metadata', async () => {
    const withDomain = [
      'LUT_3D_SIZE 2',
      'DOMAIN_MIN 0.0 0.0 0.0',
      'DOMAIN_MAX 1.0 1.0 1.0',
      '0.0 0.0 0.0',
      '1.0 0.0 0.0',
      '0.0 1.0 0.0',
      '1.0 1.0 0.0',
      '0.0 0.0 1.0',
      '1.0 0.0 1.0',
      '0.0 1.0 1.0',
      '1.0 1.0 1.0',
    ].join('\n');
    const lut = await lm.importLUT(makeFile(withDomain, 'domain.cube'));
    expect(lut).not.toBeNull();
    expect(lut!.metadata.domainMin).toEqual([0, 0, 0]);
    expect(lut!.metadata.domainMax).toEqual([1, 1, 1]);
  });

  it('parseCube returns null when data section is empty', async () => {
    const headerOnly = 'TITLE "Empty"\nLUT_3D_SIZE 2\n';
    expect(await lm.importLUT(makeFile(headerOnly, 'empty.cube'))).toBeNull();
  });

  it('REGRESSION: parseCube with LUT_3D_SIZE but no number returns null', async () => {
    // "LUT_3D_SIZE\n" → split(/\s+/)[1] = undefined → parseInt(undefined) = NaN
    // Before fix: NaN !== 0 bypasses the guard → LUT with size:NaN returned
    // After fix:  isNaN(size) short-circuits → null returned
    const malformed = [
      '# Malformed',
      'LUT_3D_SIZE',       // <- no number
      '0.0 0.0 0.0',
      '1.0 0.0 0.0',
    ].join('\n');
    const result = await lm.importLUT(makeFile(malformed, 'bad.cube'));
    expect(result).toBeNull();
  });

  it('importLUT notifies listeners on success', async () => {
    const spy = vi.fn();
    lm.subscribe(spy);
    await lm.importLUT(makeFile(VALID_CUBE_2, 'notify.cube'));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('importLUT does not notify listeners on parse failure', async () => {
    const spy = vi.fn();
    lm.subscribe(spy);
    await lm.importLUT(makeFile('bad data', 'bad.cube'));
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── Export → import round-trip ───────────────────────────────

describe('LUTManager — cube export→import round-trip', () => {
  let lm: LUTManager;

  beforeEach(() => {
    lm = new LUTManager();
    mockThumbnail(lm);
  });

  it('preserves LUT data through cube export and re-import', async () => {
    const original = makeLUT({ id: 'orig', name: 'RT Test', size: 2 });
    addLUT(lm, original);

    const cubeText = lm.exportLUT('orig', 'cube');
    const imported = await lm.importLUT(makeFile(cubeText, 'rt.cube'));

    expect(imported).not.toBeNull();
    expect(imported!.size).toBe(2);
    expect(imported!.data).toHaveLength(original.data.length);
    for (let i = 0; i < original.data.length; i++) {
      expect(imported!.data[i]).toBeCloseTo(original.data[i], 4);
    }
  });

  it('preserves LUT data through 3dl export and re-import', async () => {
    const original = makeLUT({ id: 'orig3dl', name: 'RT 3DL', size: 2 });
    addLUT(lm, original);

    const dlText = lm.exportLUT('orig3dl', '3dl');
    const imported = await lm.importLUT(makeFile(dlText, 'rt.3dl'));

    expect(imported).not.toBeNull();
    expect(imported!.size).toBe(2);
    expect(imported!.data).toHaveLength(original.data.length);
    // 3dl uses 12-bit integers so precision is ~0.024; use generous tolerance
    for (let i = 0; i < original.data.length; i++) {
      expect(imported!.data[i]).toBeCloseTo(original.data[i], 1);
    }
  });
});

// ─── generateWGSLShader ───────────────────────────────────────────────────────

describe('LUTManager — generateWGSLShader', () => {
  let lm: LUTManager;

  beforeEach(() => { lm = new LUTManager(); });

  it('returns empty string for unknown LUT id', () => {
    expect(lm.generateWGSLShader('nonexistent')).toBe('');
  });

  it('returns a WGSL compute shader string for a valid LUT', () => {
    addLUT(lm, makeLUT({ id: 'shade-lut', name: 'Shader LUT', size: 2 }));
    const shader = lm.generateWGSLShader('shade-lut');
    expect(typeof shader).toBe('string');
    expect(shader.length).toBeGreaterThan(0);
    expect(shader).toContain('@compute');
    expect(shader).toContain('textureSampleLevel');
    expect(shader).toContain('mix(color.rgb');
  });
});
