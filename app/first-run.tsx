/**
 * Artone v3 — First-Run Experience
 *
 * Apple の初回セットアップに学ぶ:
 * - 3ステップ以内に完了
 * - すべてのステップに「スキップ」
 * - 最後は必ず「完成した何か」を見せる
 * - ユーザーの腕前に合わせて UI を調整
 *
 * フロー:
 * 1. Welcome → 使い方のトーンを選ぶ (初心者 / 経験者 / プロ)
 * 2. プロジェクトテンプレート選択 (または空白)
 * 3. メディアドロップ (または Skip → デモ素材)
 */

import React, { useState, useCallback } from 'react';
import { ds, color, space, motion, typography } from './design-system';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'pro';

export interface FirstRunResult {
  level: ExperienceLevel;
  template: ProjectTemplate | null;
  mediaFiles: File[];
  skipped: boolean;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  fps: number;
  resolution: { width: number; height: number };
  tracks: number;
}

const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    description: '1080p 30fps — ゲーム実況・Vlog に最適',
    icon: '▶',
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    tracks: 3,
  },
  {
    id: 'short',
    name: 'Short / Reel',
    description: '1080×1920 30fps — 縦動画',
    icon: '📱',
    fps: 30,
    resolution: { width: 1080, height: 1920 },
    tracks: 2,
  },
  {
    id: 'film',
    name: 'Film',
    description: '4K 24fps — 映画・シネマティック',
    icon: '🎬',
    fps: 24,
    resolution: { width: 3840, height: 2160 },
    tracks: 5,
  },
  {
    id: 'blank',
    name: 'Blank',
    description: '設定なし — 素材に合わせて自動検出',
    icon: '○',
    fps: 30,
    resolution: { width: 1920, height: 1080 },
    tracks: 1,
  },
];

// === コンポーネント ===

interface FirstRunProps {
  onComplete: (result: FirstRunResult) => void;
}

export const FirstRunExperience: React.FC<FirstRunProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<ExperienceLevel>('intermediate');
  const [template, setTemplate] = useState<ProjectTemplate | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  // CSS animation key — step 変更で新しい key → 新 animation 開始
  const [animKey, setAnimKey] = useState(0);

  const advanceStep = useCallback((nextStep: number) => {
    setAnimKey((k) => k + 1);
    setStep(nextStep);
  }, []);

  const finish = useCallback(
    (skipped = false) => {
      onComplete({ level, template, mediaFiles, skipped });
    },
    [level, template, mediaFiles, onComplete]
  );

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: color.surface0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: typography.fontFamily.sans,
    color: color.textPrimary,
    zIndex: ds.z.splash,
    animation: `nv-fade-in ${motion.appear} forwards`,
  };

  const cardStyle: React.CSSProperties = {
    maxWidth: 560,
    width: '90%',
    textAlign: 'center',
  };

  const skipStyle: React.CSSProperties = {
    ...ds.button('ghost'),
    color: color.textTertiary,
    position: 'absolute',
    top: space[4],
    right: space[4],
    ...ds.text('caption'),
  };

  // --- Step 0: Welcome ---
  if (step === 0) {
    return (
      <div key={animKey} style={containerStyle}>
        <button style={skipStyle} onClick={() => finish(true)}>
          スキップ
        </button>
        <div style={cardStyle}>
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: '-0.04em',
              marginBottom: space[2],
              background: `linear-gradient(135deg, ${color.brand}, ${color.interactive})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Artone
          </div>
          <p style={{ ...ds.text('body'), color: color.textSecondary, marginBottom: space[8] }}>
            ブラウザで完結するプロ動画エディタ
          </p>

          <p style={{ ...ds.text('caption'), color: color.textTertiary, marginBottom: space[4] }}>
            あなたの経験レベルに合わせて UI を調整します
          </p>

          <div style={{ display: 'flex', gap: space[3], justifyContent: 'center' }}>
            {([
              { id: 'beginner', label: '初めて', desc: 'シンプルな画面' },
              { id: 'intermediate', label: '経験あり', desc: 'バランス型' },
              { id: 'pro', label: 'プロ', desc: '全機能表示' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setLevel(opt.id);
                  
                  advanceStep(1);
                }}
                style={{
                  ...ds.button(level === opt.id ? 'primary' : 'secondary'),
                  width: 140,
                  padding: `${space[4]}px ${space[3]}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: space[1],
                }}
              >
                <span style={{ fontWeight: 600 }}>{opt.label}</span>
                <span style={{ ...ds.text('caption'), opacity: 0.7 }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Step 1: Template ---
  if (step === 1) {
    return (
      <div key={animKey} style={containerStyle}>
        <button style={skipStyle} onClick={() => finish(true)}>
          スキップ
        </button>
        <button
          style={{ ...skipStyle, right: 'auto', left: space[4] }}
          onClick={() => advanceStep(0)}
        >
          ← 戻る
        </button>
        <div style={cardStyle}>
          <h2 style={{ ...ds.text('display'), marginBottom: space[2] }}>プロジェクトを始める</h2>
          <p style={{ ...ds.text('body'), color: color.textSecondary, marginBottom: space[6] }}>
            テンプレートを選ぶか、空白から
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: space[3],
              marginBottom: space[6],
            }}
          >
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTemplate(t);
                  
                  advanceStep(2);
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)';
                  (e.currentTarget as HTMLElement).style.borderColor = color.brand;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                  (e.currentTarget as HTMLElement).style.borderColor =
                    template?.id === t.id ? color.brand : color.border;
                }}
                style={{
                  ...ds.panel(),
                  padding: space[4],
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: `all ${motion.hover}`,
                  transform: 'scale(1)',
                  border:
                    template?.id === t.id
                      ? `2px solid ${color.brand}`
                      : `1px solid ${color.border}`,
                }}
              >
                <div style={{ fontSize: 24, marginBottom: space[2] }}>{t.icon}</div>
                <div style={{ ...ds.text('title'), marginBottom: space[1] }}>{t.name}</div>
                <div style={{ ...ds.text('caption'), color: color.textTertiary }}>
                  {t.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Step 2: Media Drop ---
  return (
    <div key={animKey} style={containerStyle}>
      <button style={skipStyle} onClick={() => finish()}>
        スキップ → デモ素材で開始
      </button>
      <button
        style={{ ...skipStyle, right: 'auto', left: space[4] }}
        onClick={() => advanceStep(1)}
      >
        ← 戻る
      </button>
      <div style={cardStyle}>
        <h2 style={{ ...ds.text('display'), marginBottom: space[2] }}>素材を追加</h2>
        <p style={{ ...ds.text('body'), color: color.textSecondary, marginBottom: space[6] }}>
          ドラッグ＆ドロップ、またはクリックで選択
        </p>

        <div
          style={{
            ...ds.panel(),
            height: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: `2px dashed ${mediaFiles.length > 0 ? color.brand : color.border}`,
            transition: `all ${motion.hover}`,
            marginBottom: space[6],
          }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = 'video/*,audio/*,image/*';
            input.onchange = (e) => {
              const files = Array.from((e.target as HTMLInputElement).files ?? []);
              if (files.length > 0) setMediaFiles(files);
            };
            input.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) setMediaFiles(files);
          }}
        >
          {mediaFiles.length > 0 ? (
            <>
              <span style={{ fontSize: 32, marginBottom: space[2] }}>✓</span>
              <span style={{ color: color.positive }}>
                {mediaFiles.length} ファイル選択済み
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 32, marginBottom: space[2], opacity: 0.5 }}>⬇</span>
              <span style={{ color: color.textTertiary }}>動画・音声・画像をここにドロップ</span>
            </>
          )}
        </div>

        <button
          style={{ ...ds.button('primary'), width: '100%', padding: `${space[3]}px 0` }}
          onClick={() => finish()}
        >
          {mediaFiles.length > 0 ? '編集を始める' : 'デモ素材で始める'}
        </button>
      </div>
      <style>{`
        @keyframes nv-fade-in {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};
