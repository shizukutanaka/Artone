/**
 * Artone v3 — Drop Zone
 *
 * アプリ全域でのファイルドロップを受け付ける。
 * ドラッグ中のみオーバーレイ表示。常時は透明。
 */

import React, { useState, useCallback, useRef } from 'react';
import { color, space, radius, z } from './design-system';
import { t } from '../i18n/i18n-manager';
import { getMediaType } from '../media/media-browser';

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  accept?: string;
  children: React.ReactNode;
}

/**
 * Whether a dropped file should be accepted for the given `accept` spec
 * (a comma-separated MIME list like "video/*,audio/*,image/*").
 *
 * A file passes if its MIME matches the spec, OR — as a fallback — its
 * extension classifies it as a media type whose category is in the spec.
 * The fallback exists because browsers frequently report an empty ('') or
 * nonstandard (application/x-*) MIME for common containers like .mkv/.mov/
 * .avi; the file picker (via the `accept` attribute) admits those by
 * extension, so drag-drop must accept the same set or the two import paths
 * silently diverge (the picker works, the drop is ignored with no error).
 */
export function acceptsFile(file: File, accept: string): boolean {
  const types = accept.split(',').map((s) => s.trim()).filter(Boolean);
  const mimeOk = types.some((tp) =>
    tp.endsWith('/*') ? file.type.startsWith(tp.replace('/*', '/')) : file.type === tp
  );
  if (mimeOk) return true;
  const category = getMediaType(file.name); // 'video' | 'audio' | 'image' | null
  if (!category) return false;
  return types.includes(`${category}/*`) || types.includes(category);
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesDropped,
  accept = 'video/*,audio/*,image/*',
  children,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const counter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counter.current++;
    if (e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    counter.current--;
    if (counter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    counter.current = 0;
    const files = Array.from(e.dataTransfer.files).filter((f) => acceptsFile(f, accept));
    if (files.length > 0) onFilesDropped(files);
  }, [onFilesDropped, accept]);

  return (
    <div
      style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `${color.brand}15`,
          border: `2px dashed ${color.brand}`,
          borderRadius: radius.lg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: z.modal, pointerEvents: 'none',
        }}>
          <div style={{
            background: color.surface3, padding: `${space[4]}px ${space[8]}px`,
            borderRadius: radius.lg, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: space[2] }}>⬇</div>
            <div style={{ color: color.textPrimary, fontWeight: 600, fontSize: 16 }}>{t('media.dropTitle')}</div>
            <div style={{ color: color.textTertiary, fontSize: 13, marginTop: space[1] }}>{t('media.acceptedTypes')}</div>
          </div>
        </div>
      )}
    </div>
  );
};
