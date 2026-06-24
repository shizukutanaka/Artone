/**
 * Artone v3 — Inspector Panel
 *
 * コンテキスト感応プロパティエディタ
 * 選択中の要素 (clip / effect / audio / project) に応じて切り替え
 *
 * @version 3.0.0
 */

import { color } from './design-system';
import React from 'react';
import { t } from '../i18n/i18n-manager';


// ============================================================
// Types
// ============================================================

export type SelectionType = 'clip' | 'effect' | 'audio' | 'project' | 'none';

export interface ClipSelection {
  type: 'clip';
  id: string;
  name: string;
  duration: number;
  startTime: number;
  speed: number;
  opacity: number;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
}

export interface EffectSelection {
  type: 'effect';
  id: string;
  name: string;
  enabled: boolean;
  parameters: Record<string, number | string | boolean>;
}

export interface AudioSelection {
  type: 'audio';
  id: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

export interface ProjectSelection {
  type: 'project';
  name: string;
  fps: number;
  resolution: { width: number; height: number };
  duration: number;
}

export type Selection = ClipSelection | EffectSelection | AudioSelection | ProjectSelection | { type: 'none' };

// ============================================================
// Reusable Controls
// ============================================================

interface RowProps {
  label: string;
  children: React.ReactNode;
}

const Row: React.FC<RowProps> = ({ label, children }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
      minHeight: 28
    }}
  >
    <label
      style={{
        flex: '0 0 96px',
        fontSize: 12,
        color: color.textSecondary
      }}
    >
      {label}
    </label>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);

interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({ value, onChange, min, max, step = 1, unit }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={{
        flex: 1,
        background: color.surface4,
        border: `1px solid ${color.border}`,
        borderRadius: 4,
        color: color.textPrimary,
        padding: '4px 8px',
        fontSize: 12,
        fontFamily: 'ui-monospace, monospace'
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = color.borderFocus;
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = color.border;
      }}
    />
    {unit && <span style={{ fontSize: 11, color: color.textTertiary }}>{unit}</span>}
  </div>
);

interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}

const Slider: React.FC<SliderProps> = ({ value, onChange, min, max, step = 0.01 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{
        flex: 1,
        accentColor: color.brand
      }}
    />
    <span
      style={{
        flex: '0 0 48px',
        fontSize: 11,
        color: color.textTertiary,
        textAlign: 'right',
        fontFamily: 'ui-monospace, monospace'
      }}
    >
      {value.toFixed(2)}
    </span>
  </div>
);

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

const Toggle: React.FC<ToggleProps> = ({ value, onChange, label }) => (
  <button
    onClick={() => onChange(!value)}
    style={{
      width: 36,
      height: 20,
      background: value ? color.brand : color.border,
      border: 'none',
      borderRadius: 10,
      cursor: 'pointer',
      position: 'relative',
      transition: 'background 0.15s'
    }}
    aria-label={label}
    aria-pressed={value}
  >
    <div
      style={{
        position: 'absolute',
        top: 2,
        left: value ? 18 : 2,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: color.textPrimary,
        transition: 'left 0.15s'
      }}
    />
  </button>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 16 }}>
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: color.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
        paddingBottom: 4,
        borderBottom: `1px solid ${color.border}`
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

// ============================================================
// Type-specific Inspectors
// ============================================================

const ClipInspector: React.FC<{ sel: ClipSelection; onChange: (s: ClipSelection) => void }> = ({
  sel,
  onChange
}) => (
  <>
    <Section title={t('inspector.section.basic')}>
      <Row label={t('inspector.label.name')}>
        <input
          value={sel.name}
          onChange={(e) => onChange({ ...sel, name: e.target.value })}
          style={{
            width: '100%',
            background: color.surface4,
            border: `1px solid ${color.border}`,
            borderRadius: 4,
            color: color.textPrimary,
            padding: '4px 8px',
            fontSize: 12
          }}
        />
      </Row>
      <Row label={t('inspector.label.start')}>
        <NumberInput
          value={sel.startTime}
          onChange={(v) => onChange({ ...sel, startTime: v })}
          step={0.01}
          unit="s"
        />
      </Row>
      <Row label={t('media.duration')}>
        <NumberInput
          value={sel.duration}
          onChange={(v) => onChange({ ...sel, duration: v })}
          min={0}
          step={0.01}
          unit="s"
        />
      </Row>
      <Row label={t('timeline.clip.speed')}>
        <Slider
          value={sel.speed}
          onChange={(v) => onChange({ ...sel, speed: v })}
          min={0.1}
          max={4}
        />
      </Row>
    </Section>

    <Section title={t('inspector.section.transform')}>
      <Row label="X">
        <NumberInput value={sel.position.x} onChange={(v) => onChange({ ...sel, position: { ...sel.position, x: v } })} unit="px" />
      </Row>
      <Row label="Y">
        <NumberInput value={sel.position.y} onChange={(v) => onChange({ ...sel, position: { ...sel.position, y: v } })} unit="px" />
      </Row>
      <Row label={t('inspector.label.scale')}>
        <Slider value={sel.scale} onChange={(v) => onChange({ ...sel, scale: v })} min={0.1} max={4} />
      </Row>
      <Row label={t('inspector.label.rotation')}>
        <NumberInput value={sel.rotation} onChange={(v) => onChange({ ...sel, rotation: v })} unit="°" />
      </Row>
    </Section>

    <Section title={t('inspector.section.opacity')}>
      <Row label={t('inspector.label.alpha')}>
        <Slider value={sel.opacity} onChange={(v) => onChange({ ...sel, opacity: v })} min={0} max={1} />
      </Row>
    </Section>
  </>
);

const EffectInspector: React.FC<{ sel: EffectSelection; onChange: (s: EffectSelection) => void }> = ({
  sel,
  onChange
}) => (
  <>
    <Section title={sel.name}>
      <Row label={t('inspector.label.enabled')}>
        <Toggle value={sel.enabled} onChange={(v) => onChange({ ...sel, enabled: v })} />
      </Row>
      {Object.entries(sel.parameters).map(([key, value]) => (
        <Row key={key} label={key}>
          {typeof value === 'number' ? (
            <Slider
              value={value}
              onChange={(v) =>
                onChange({ ...sel, parameters: { ...sel.parameters, [key]: v } })
              }
              min={0}
              max={1}
            />
          ) : typeof value === 'boolean' ? (
            <Toggle
              value={value}
              onChange={(v) =>
                onChange({ ...sel, parameters: { ...sel.parameters, [key]: v } })
              }
            />
          ) : (
            <input
              value={String(value)}
              onChange={(e) =>
                onChange({ ...sel, parameters: { ...sel.parameters, [key]: e.target.value } })
              }
              style={{
                width: '100%',
                background: color.surface4,
                border: `1px solid ${color.border}`,
                borderRadius: 4,
                color: color.textPrimary,
                padding: '4px 8px',
                fontSize: 12
              }}
            />
          )}
        </Row>
      ))}
    </Section>
  </>
);

const AudioInspector: React.FC<{ sel: AudioSelection; onChange: (s: AudioSelection) => void }> = ({
  sel,
  onChange
}) => (
  <>
    <Section title={t('audio.title')}>
      <Row label={t('audio.volume')}>
        <Slider value={sel.volume} onChange={(v) => onChange({ ...sel, volume: v })} min={0} max={2} />
      </Row>
      <Row label={t('audio.pan')}>
        <Slider value={sel.pan} onChange={(v) => onChange({ ...sel, pan: v })} min={-1} max={1} />
      </Row>
      <Row label={t('audio.mute')}>
        <Toggle value={sel.muted} onChange={(v) => onChange({ ...sel, muted: v })} />
      </Row>
      <Row label={t('timeline.track.solo')}>
        <Toggle value={sel.solo} onChange={(v) => onChange({ ...sel, solo: v })} />
      </Row>
    </Section>
  </>
);

const ProjectInspector: React.FC<{ sel: ProjectSelection; onChange: (s: ProjectSelection) => void }> = ({
  sel,
  onChange
}) => (
  <>
    <Section title={t('inspector.section.project')}>
      <Row label={t('inspector.label.name')}>
        <input
          value={sel.name}
          onChange={(e) => onChange({ ...sel, name: e.target.value })}
          style={{
            width: '100%',
            background: color.surface4,
            border: `1px solid ${color.border}`,
            borderRadius: 4,
            color: color.textPrimary,
            padding: '4px 8px',
            fontSize: 12
          }}
        />
      </Row>
      <Row label="FPS">
        <select
          value={sel.fps}
          onChange={(e) => onChange({ ...sel, fps: parseFloat(e.target.value) })}
          style={{
            width: '100%',
            background: color.surface4,
            border: `1px solid ${color.border}`,
            borderRadius: 4,
            color: color.textPrimary,
            padding: '4px 8px',
            fontSize: 12
          }}
        >
          {[23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120].map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Row>
      <Row label={t('export.resolution')}>
        <div style={{ display: 'flex', gap: 4 }}>
          <NumberInput
            value={sel.resolution.width}
            onChange={(v) => onChange({ ...sel, resolution: { ...sel.resolution, width: v } })}
          />
          <span style={{ color: color.textTertiary, alignSelf: 'center' }}>×</span>
          <NumberInput
            value={sel.resolution.height}
            onChange={(v) => onChange({ ...sel, resolution: { ...sel.resolution, height: v } })}
          />
        </div>
      </Row>
    </Section>
  </>
);

// ============================================================
// Main Inspector
// ============================================================

interface InspectorProps {
  selection: Selection;
  onChange: (s: Selection) => void;
}

export const Inspector: React.FC<InspectorProps> = React.memo(({ selection, onChange }) => {
  if (selection.type === 'none') {
    return (
      <div
        style={{
          color: color.textTertiary,
          fontSize: 13,
          textAlign: 'center',
          padding: 24
        }}
      >
        {t('inspector.selectHint')}
      </div>
    );
  }

  if (selection.type === 'clip') {
    return <ClipInspector sel={selection} onChange={(s) => onChange(s)} />;
  }
  if (selection.type === 'effect') {
    return <EffectInspector sel={selection} onChange={(s) => onChange(s)} />;
  }
  if (selection.type === 'audio') {
    return <AudioInspector sel={selection} onChange={(s) => onChange(s)} />;
  }
  if (selection.type === 'project') {
    return <ProjectInspector sel={selection} onChange={(s) => onChange(s)} />;
  }
  return null;
});
Inspector.displayName = 'Inspector';

export default Inspector;
