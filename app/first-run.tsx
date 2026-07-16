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
import { t } from '../i18n/i18n-manager';

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

interface ProjectTemplateConfig {
  id: string;
  name: string;
  descKey: string;
  icon: string;
  fps: number;
  resolution: { width: number; height: number };
  tracks: number;
}

const TEMPLATE_CONFIGS: ProjectTemplateConfig[] = [
  { id: 'youtube', name: 'YouTube', descKey: 'firstRun.templateYoutubeDesc', icon: '▶', fps: 30, resolution: { width: 1920, height: 1080 }, tracks: 3 },
  { id: 'short', name: 'Short / Reel', descKey: 'firstRun.templateShortDesc', icon: '📱', fps: 30, resolution: { width: 1080, height: 1920 }, tracks: 2 },
  { id: 'film', name: 'Film', descKey: 'firstRun.templateFilmDesc', icon: '🎬', fps: 24, resolution: { width: 3840, height: 2160 }, tracks: 5 },
  { id: 'blank', name: 'Blank', descKey: 'firstRun.templateBlankDesc', icon: '○', fps: 30, resolution: { width: 1920, height: 1080 }, tracks: 1 },
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
    animation: `artone-fade-in ${motion.appear} forwards`,
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

  // REGRESSION fix: containerStyle references the `artone-fade-in` keyframes
  // on every step, but the <style> tag defining them used to live only in
  // Step 2's JSX -- so Steps 0 and 1 (including the very first Welcome
  // screen) referenced a nonexistent animation and never faded in at all.
  // Rendered as the first child of every step's container so it's always
  // mounted regardless of which step branch returns.
  const fadeInKeyframes = (
    <style>{`
      @keyframes artone-fade-in {
        from { opacity: 0; transform: scale(0.97); }
        to { opacity: 1; transform: scale(1); }
      }
    `}</style>
  );

  // --- Step 0: Welcome ---
  if (step === 0) {
    return (
      <div key={animKey} style={containerStyle}>
        {fadeInKeyframes}
        <button style={skipStyle} onClick={() => finish(true)}>
          {t('common.skip')}
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
            {t('app.tagline')}
          </p>

          <p style={{ ...ds.text('caption'), color: color.textTertiary, marginBottom: space[4] }}>
            {t('firstRun.levelHint')}
          </p>

          <div style={{ display: 'flex', gap: space[3], justifyContent: 'center' }}>
            {([
              { id: 'beginner', label: t('firstRun.levelBeginner'), desc: t('firstRun.levelBeginnerDesc') },
              { id: 'intermediate', label: t('firstRun.levelIntermediate'), desc: t('firstRun.levelIntermediateDesc') },
              { id: 'pro', label: t('firstRun.levelPro'), desc: t('firstRun.levelProDesc') },
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
        {fadeInKeyframes}
        <button style={skipStyle} onClick={() => finish(true)}>
          {t('common.skip')}
        </button>
        <button
          style={{ ...skipStyle, right: 'auto', left: space[4] }}
          onClick={() => advanceStep(0)}
        >
          ← {t('common.back')}
        </button>
        <div style={cardStyle}>
          <h2 style={{ ...ds.text('display'), marginBottom: space[2] }}>{t('firstRun.step2Title')}</h2>
          <p style={{ ...ds.text('body'), color: color.textSecondary, marginBottom: space[6] }}>
            {t('firstRun.step2Subtitle')}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: space[3],
              marginBottom: space[6],
            }}
          >
            {TEMPLATE_CONFIGS.map((cfg) => {
              const tmpl: ProjectTemplate = { id: cfg.id, name: cfg.name, description: t(cfg.descKey), icon: cfg.icon, fps: cfg.fps, resolution: cfg.resolution, tracks: cfg.tracks };
              return (
              <button
                key={cfg.id}
                onClick={() => {
                  setTemplate(tmpl);

                  advanceStep(2);
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1.03)';
                  (e.currentTarget as HTMLElement).style.borderColor = color.brand;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                  (e.currentTarget as HTMLElement).style.borderColor =
                    template?.id === cfg.id ? color.brand : color.border;
                }}
                style={{
                  ...ds.panel(),
                  padding: space[4],
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: `all ${motion.hover}`,
                  transform: 'scale(1)',
                  border:
                    template?.id === cfg.id
                      ? `2px solid ${color.brand}`
                      : `1px solid ${color.border}`,
                }}
              >
                <div style={{ fontSize: 24, marginBottom: space[2] }}>{cfg.icon}</div>
                <div style={{ ...ds.text('title'), marginBottom: space[1] }}>{cfg.name}</div>
                <div style={{ ...ds.text('caption'), color: color.textTertiary }}>
                  {tmpl.description}
                </div>
              </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- Step 2: Media Drop ---
  return (
    <div key={animKey} style={containerStyle}>
      {fadeInKeyframes}
      <button style={skipStyle} onClick={() => finish()}>
        {t('firstRun.skipToDemo')}
      </button>
      <button
        style={{ ...skipStyle, right: 'auto', left: space[4] }}
        onClick={() => advanceStep(1)}
      >
        ← {t('common.back')}
      </button>
      <div style={cardStyle}>
        <h2 style={{ ...ds.text('display'), marginBottom: space[2] }}>{t('firstRun.step3Title')}</h2>
        <p style={{ ...ds.text('body'), color: color.textSecondary, marginBottom: space[6] }}>
          {t('firstRun.step3Subtitle')}
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
                {t('firstRun.filesSelected', { count: mediaFiles.length })}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 32, marginBottom: space[2], opacity: 0.5 }}>⬇</span>
              <span style={{ color: color.textTertiary }}>{t('firstRun.dropHint')}</span>
            </>
          )}
        </div>

        <button
          style={{ ...ds.button('primary'), width: '100%', padding: `${space[3]}px 0` }}
          onClick={() => finish()}
        >
          {mediaFiles.length > 0 ? t('firstRun.startEditing') : t('firstRun.startDemo')}
        </button>
      </div>
    </div>
  );
};
