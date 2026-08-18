/**
 * Artone v3 — Preview Pane
 *
 * 取り込んだメディアを**実際に表示する**面。
 *
 * ## なぜ独立コンポーネントなのか
 * ここはコアループ「取り込む → **見る** → 編集 → プレビュー → 書き出す」の
 * 「見る」段そのものである。従来この面はテキストラベルだけのプレースホルダで、
 * ユーザーは取り込んだ映像を一度も見られなかった。shell.tsx から切り出すことで、
 * 表示切り替えのロジックを jsdom で単体検証できるようにしている。
 *
 * ## 回転を CSS で当てないこと
 * コンテナの回転メタデータは**ブラウザが `<video>`/`<img>` の描画時に適用済み**
 * (`videoWidth`/`videoHeight` も回転適用後の値になる)。ここで CSS transform を
 * 重ねると二重回転になるため、意図的に何もしない。
 *
 * # AI generated (reviewed)
 *
 * @version 3.1.0
 */
import React from 'react';
import { color, radius, ds } from './design-system';
import { t } from '../i18n/i18n-manager';
import type { MediaItem } from './MediaBrowser';

export interface PreviewPaneProps {
  /** 表示対象。未選択なら undefined。 */
  item: MediaItem | undefined;
  /** エンジン初期化済みか (未初期化ならローディング表示)。 */
  isReady: boolean;
  /** タイムラインの再生位置 (秒)。省略時は追従しない。 */
  currentTime?: number;
  /** 再生中か。省略時は追従しない。 */
  isPlaying?: boolean;
}

/**
 * 再生位置をどれだけずれたら追従シークするかの閾値 (秒)。
 *
 * 毎フレーム `currentTime` を代入するとブラウザが再生を途切れさせるため、
 * **ずれが目に見える大きさになった時だけ**シークする。0.25s は 30fps で約7.5
 * フレーム相当で、通常の再生ドリフトでは発火せず、ユーザーがタイムラインを
 * 掴んで動かした時には確実に発火する値。
 */
export const SEEK_SYNC_THRESHOLD_SEC = 0.25;

/**
 * 再生位置を `<video>` へ反映すべきか判定する純関数。
 *
 * @param videoTime 現在の `<video>.currentTime`
 * @param timelineTime タイムラインの再生位置
 */
export function shouldSyncSeek(videoTime: number, timelineTime: number): boolean {
  if (!Number.isFinite(videoTime) || !Number.isFinite(timelineTime)) return false;
  return Math.abs(videoTime - timelineTime) > SEEK_SYNC_THRESHOLD_SEC;
}

/** プレビュー面に表示すべき内容の種別。 */
export type PreviewKind = 'video' | 'image' | 'audio' | 'empty' | 'loading';

/**
 * 表示種別を決める純関数 (テスト可能な本体)。
 *
 * エンジン未初期化を最優先で見るのは、初期化前に blob URL を読み込ませても
 * 意味がなくエラー表示が出るだけのため。
 */
export function selectPreviewKind(item: MediaItem | undefined, isReady: boolean): PreviewKind {
  if (!isReady) return 'loading';
  if (!item) return 'empty';
  if (item.type === 'video') return 'video';
  if (item.type === 'image') return 'image';
  return 'audio';
}

const FRAME_STYLE: React.CSSProperties = {
  width: '90%',
  maxWidth: 800,
  aspectRatio: '16/9',
  background: color.surface0,
  borderRadius: radius.md,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: color.textTertiary,
  overflow: 'hidden',
};

const MEDIA_STYLE: React.CSSProperties = {
  // アスペクト比を保ったまま枠に収める (縦動画も破綻しない)。
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
  display: 'block',
};

/**
 * 選択中メディアを表示する。映像は `<video>` をそのまま使うため、デコードは
 * ブラウザに任せられる (WebCodecs のデコード配線を待たずに「見る」段が成立する)。
 */
export const PreviewPane = React.memo(function PreviewPane({
  item, isReady, currentTime, isPlaying,
}: PreviewPaneProps) {
  const kind = selectPreviewKind(item, isReady);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // タイムラインの再生位置へ追従する。閾値を超えた時だけシークするのは、
  // 毎フレーム currentTime を代入するとブラウザが再生を途切れさせるため。
  React.useEffect(() => {
    const el = videoRef.current;
    if (!el || currentTime === undefined) return;
    if (shouldSyncSeek(el.currentTime, currentTime)) {
      el.currentTime = currentTime;
    }
  }, [currentTime]);

  // 再生/停止をタイムラインに合わせる。play() は Promise を返し、
  // 自動再生ポリシー等で拒否されうるので握り潰す (UI を壊さない)。
  React.useEffect(() => {
    const el = videoRef.current;
    if (!el || isPlaying === undefined) return;
    if (isPlaying && el.paused) void el.play?.()?.catch?.(() => undefined);
    else if (!isPlaying && !el.paused) el.pause?.();
  }, [isPlaying]);

  if (kind === 'loading') {
    return <div style={FRAME_STYLE} data-preview="loading">{t('preview.loading')}</div>;
  }
  if (kind === 'empty') {
    return <div style={FRAME_STYLE} data-preview="empty">{t('preview.empty')}</div>;
  }
  if (kind === 'image') {
    return (
      <div style={FRAME_STYLE} data-preview="image">
        <img src={item!.url} alt={item!.name} style={MEDIA_STYLE} />
      </div>
    );
  }
  if (kind === 'audio') {
    return (
      <div style={{ ...FRAME_STYLE, flexDirection: 'column', gap: 8 }} data-preview="audio">
        <div style={{ ...ds.text('body') }}>{item!.name}</div>
        <audio src={item!.url} controls style={{ width: '80%' }} />
      </div>
    );
  }
  return (
    <div style={FRAME_STYLE} data-preview="video">
      {/*
        controls を付けて再生位置を操作できるようにする。muted は付けない —
        ユーザーは音を確認したいのが普通で、自動再生もしないため
        ブラウザの自動再生ポリシーには抵触しない。
      */}
      <video ref={videoRef} src={item!.url} controls playsInline style={MEDIA_STYLE} data-testid="preview-video" />
    </div>
  );
});
