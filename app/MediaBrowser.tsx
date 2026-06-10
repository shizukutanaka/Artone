/**
 * Artone v3 — Media Browser
 *
 * メディアインポート + プロキシ生成ステータス + メタデータ
 *
 * @version 3.0.0
 */

import { color } from './design-system';
import React, { useState, useCallback, useRef } from 'react';
import { t } from '../i18n/i18n-manager';


// ============================================================
// Types
// ============================================================

export interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  duration?: number;
  size: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  url: string;
  proxyStatus?: 'none' | 'pending' | 'processing' | 'ready' | 'failed';
  proxyProgress?: number;
}

export interface MediaBrowserProps {
  items: MediaItem[];
  onImport: (files: File[]) => void;
  onSelect: (item: MediaItem) => void;
  onDelete: (id: string) => void;
  selectedId?: string;
}

// ============================================================
// Helpers
// ============================================================

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getProxyBadge(item: MediaItem): { label: string; color: string } | null {
  switch (item.proxyStatus) {
    case 'pending':
      return { label: t('media.status.pending'), color: color.caution };
    case 'processing':
      return {
        label: `${Math.round((item.proxyProgress || 0) * 100)}%`,
        color: color.brand
      };
    case 'ready':
      return { label: t('media.status.proxy'), color: color.positive };
    case 'failed':
      return { label: t('media.status.error'), color: color.destructive };
    default:
      return null;
  }
}

// ============================================================
// Item View
// ============================================================

const ItemView: React.FC<{
  item: MediaItem;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ item, selected, onSelect, onDelete }) => {
  const [hover, setHover] = useState(false);
  const badge = getProxyBadge(item);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: selected ? color.surface3 : hover ? color.surface2 : color.surface1,
        border: `1px solid ${selected ? color.brand : color.border}`,
        borderRadius: 6,
        padding: 8,
        marginBottom: 6,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.15s'
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 64,
            height: 36,
            background: color.surface0,
            borderRadius: 4,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            color: color.textTertiary
          }}
        >
          {item.thumbnailUrl ? (
            <img
              src={item.thumbnailUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : item.type === 'video' ? (
            '🎬'
          ) : item.type === 'audio' ? (
            '🎵'
          ) : (
            '🖼'
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              color: color.textPrimary,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: 2
            }}
            title={item.name}
          >
            {item.name}
          </div>
          <div
            style={{
              fontSize: 10,
              color: color.textTertiary,
              fontFamily: 'ui-monospace, monospace'
            }}
          >
            {item.width && item.height && `${item.width}×${item.height} · `}
            {formatDuration(item.duration)}
            {item.duration && ' · '}
            {formatSize(item.size)}
          </div>
          {badge && (
            <div
              style={{
                display: 'inline-block',
                marginTop: 4,
                padding: '1px 6px',
                background: badge.color + '20',
                color: badge.color,
                borderRadius: 3,
                fontSize: 9,
                fontWeight: 600
              }}
            >
              {badge.label}
            </div>
          )}
        </div>
      </div>
      {hover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 20,
            height: 20,
            background: color.destructive + '40',
            border: 'none',
            borderRadius: 4,
            color: color.destructive,
            cursor: 'pointer',
            fontSize: 12
          }}
          title="削除"
        >
          ×
        </button>
      )}
    </div>
  );
};

// ============================================================
// Main Browser
// ============================================================

export const MediaBrowser: React.FC<MediaBrowserProps> = ({
  items,
  onImport,
  onSelect,
  onDelete,
  selectedId
}) => {
  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [search, setSearch] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = items
    .filter((i) => filter === 'all' || i.type === filter)
    .filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onImport(files);
    },
    [onImport]
  );

  const handleFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) onImport(files);
      e.target.value = '';
    },
    [onImport]
  );

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: dragOver ? color.brand + '10' : 'transparent',
        border: dragOver ? `2px dashed ${color.brand}` : 'none'
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '6px 12px',
            background: color.brand,
            color: color.surface1,
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600
          }}
        >
          + インポート
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          onChange={handleFiles}
          style={{ display: 'none' }}
        />

        <input
          type="text"
          placeholder={t('media.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '4px 8px',
            background: color.surface1,
            border: `1px solid ${color.border}`,
            borderRadius: 4,
            color: color.textPrimary,
            fontSize: 11
          }}
        />

        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'video', 'audio', 'image'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1,
                padding: '4px',
                background: filter === f ? color.brand : 'transparent',
                color: filter === f ? color.surface1 : color.textSecondary,
                border: `1px solid ${filter === f ? color.brand : color.border}`,
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 500
              }}
            >
              {f === 'all' ? t('media.all') : f === 'video' ? t('media.video') : f === 'audio' ? t('media.audio') : t('media.image')}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {filtered.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: color.textTertiary,
              fontSize: 12,
              padding: 24
            }}
          >
            {items.length === 0 ? t('media.empty') : t('media.noMatch')}
          </div>
        ) : (
          filtered.map((item) => (
            <ItemView
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={() => onSelect(item)}
              onDelete={() => onDelete(item.id)}
            />
          ))
        )}
      </div>

      {/* Stats */}
      <div
        style={{
          paddingTop: 8,
          borderTop: `1px solid ${color.border}`,
          fontSize: 10,
          color: color.textTertiary,
          fontFamily: 'ui-monospace, monospace'
        }}
      >
        {filtered.length} / {items.length} アイテム ·{' '}
        {formatSize(items.reduce((s, i) => s + i.size, 0))}
      </div>
    </div>
  );
};

export default MediaBrowser;
