/**
 * Tests for app/drop-zone.tsx — acceptsFile().
 *
 * REGRESSION: handleDrop filtered dropped files purely by MIME
 * (f.type.startsWith('video/') etc.). Browsers frequently report an empty or
 * nonstandard MIME for common containers (.mkv/.mov/.avi), so dragging such a
 * file was silently ignored (files.length === 0, no error) even though the
 * file picker — which matches by the `accept` attribute — imports it fine.
 * acceptsFile now falls back to extension-based classification so both import
 * paths accept the same set.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { acceptsFile } from '../app/drop-zone';

const ALL = 'video/*,audio/*,image/*';
const file = (name: string, type = '') => new File(['x'], name, { type });

describe('acceptsFile', () => {
  it('accepts a file whose MIME matches a wildcard in the spec', () => {
    expect(acceptsFile(file('clip.mp4', 'video/mp4'), ALL)).toBe(true);
    expect(acceptsFile(file('song.mp3', 'audio/mpeg'), ALL)).toBe(true);
    expect(acceptsFile(file('pic.png', 'image/png'), ALL)).toBe(true);
  });

  it('accepts a file whose MIME matches an exact (non-wildcard) type', () => {
    expect(acceptsFile(file('clip.mp4', 'video/mp4'), 'video/mp4')).toBe(true);
    expect(acceptsFile(file('clip.mp4', 'video/webm'), 'video/mp4')).toBe(false);
  });

  it('REGRESSION: accepts a .mkv/.mov/.avi reported with an empty MIME via extension fallback', () => {
    expect(acceptsFile(file('movie.mkv', ''), ALL)).toBe(true);
    expect(acceptsFile(file('movie.mov', ''), ALL)).toBe(true);
    expect(acceptsFile(file('movie.avi', ''), ALL)).toBe(true);
  });

  it('accepts a container reported with a nonstandard application/x-* MIME', () => {
    // Some browsers report application/x-matroska for .mkv — startsWith('video/')
    // is false, so this only passes via the extension fallback.
    expect(acceptsFile(file('movie.mkv', 'application/x-matroska'), ALL)).toBe(true);
  });

  it('rejects a recognized media file whose category is not in the accept spec', () => {
    // accept is video-only; an empty-MIME audio file must not sneak in via the
    // extension fallback.
    expect(acceptsFile(file('song.mp3', ''), 'video/*')).toBe(false);
    // ...but the same audio file passes when audio is accepted.
    expect(acceptsFile(file('song.mp3', ''), 'audio/*')).toBe(true);
  });

  it('rejects a file that is neither MIME-matched nor a recognized media extension', () => {
    expect(acceptsFile(file('notes.txt', ''), ALL)).toBe(false);
    expect(acceptsFile(file('archive.zip', 'application/zip'), ALL)).toBe(false);
    expect(acceptsFile(file('noext', ''), ALL)).toBe(false);
  });

  it('matches extensions case-insensitively', () => {
    expect(acceptsFile(file('CLIP.MKV', ''), ALL)).toBe(true);
  });
});
