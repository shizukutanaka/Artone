/**
 * Artone v3 — Drop Zone
 *
 * アプリ全域でのファイルドロップを受け付ける。
 * ドラッグ中のみオーバーレイ表示。常時は透明。
 */

import React, { useState, useCallback, useRef } from 'react';
import { color, space, radius, z } from './design-system';
import { t } from '../i18n/i18n-manager';

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  accept?: string;
  children: React.ReactNode;
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
    const types = accept.split(',').map((t) => t.trim());
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      types.some((t) => t.endsWith('/*') ? f.type.startsWith(t.replace('/*', '/')) : f.type === t)
    );
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
