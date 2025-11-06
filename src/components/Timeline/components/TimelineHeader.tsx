/**
 * Timeline Header Component
 *
 * This component renders the timeline header with zoom controls,
 * shortcuts, and ripple edit controls.
 */

import * as React from 'react';
import styled from '@emotion/styled';
import type { TimelineEventHandlers, TimelineRenderState, TimelineRenderContext } from './types';

const TimelineHeaderWrapper = styled.div`
  display: flex;
  background: #1e293b;
  border-bottom: 1px solid #334155;
`;

const TimelineHeaderMain = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const TimelineToolbar = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.75rem;
  padding: 0.75rem 0.75rem 0.5rem;
  background: #1e293b;
  border-bottom: 1px solid #334155;
`;

const ZoomControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  color: #e2e8f0;
`;

const ShortcutControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
`;

const RippleControls = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.35rem;
  width: 100%;
`;

const RippleToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const RippleToggleButton = styled.button<{ active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: ${({ active }) => active ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#334155'};
  color: #f8fafc;
  border: 1px solid ${({ active }) => active ? '#15803d' : '#475569'};
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: ${({ active }) => active ? 'linear-gradient(135deg, #16a34a, #15803d)' : '#475569'};
  }

  &:focus-visible {
    outline: 2px solid #38bdf8;
    outline-offset: 2px;
  }
`;

const RippleStateTag = styled.span<{ active: boolean }>`
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid ${({ active }) => active ? 'rgba(34, 197, 94, 0.45)' : 'rgba(148, 163, 184, 0.4)'};
  background: ${({ active }) => active ? 'rgba(34, 197, 94, 0.14)' : 'rgba(148, 163, 184, 0.12)'};
  color: ${({ active }) => active ? '#86efac' : '#cbd5f5'};
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const RippleHelper = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
  text-align: right;
  max-width: 420px;

  @media (max-width: 640px) {
    text-align: left;
  }
`;

const ShortcutButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: #334155;
  color: #e2e8f0;
  border: 1px solid #475569;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #475569;
  }

  &:focus-visible {
    outline: 2px solid #38bdf8;
    outline-offset: 2px;
  }
`;

const ShortcutsPanel = styled.div`
  position: absolute;
  top: 3.5rem;
  right: 0.75rem;
  width: min(420px, 90vw);
  max-height: 320px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid #334155;
  border-radius: 0.75rem;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.45);
  padding: 1rem;
  z-index: 20;
  backdrop-filter: blur(8px);
`;

const ShortcutsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
`;

const ShortcutsTitle = styled.h2`
  margin: 0;
  font-size: 0.85rem;
  color: #e2e8f0;
`;

const ShortcutList = styled.dl`
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
`;

const ShortcutTerm = styled.dt`
  font-size: 0.7rem;
  font-weight: 700;
  color: #38bdf8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ShortcutDefinition = styled.dd`
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: #cbd5f5;
`;

const ZoomButton = styled.button`
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #334155;
  color: #e2e8f0;
  border: 1px solid #475569;
  border-radius: 0.375rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #475569;
  }

  &:focus-visible {
    outline: 2px solid #38bdf8;
    outline-offset: 2px;
  }
`;

const ZoomSlider = styled.input`
  width: 160px;
  accent-color: #38bdf8;

  @media (max-width: 900px) {
    width: 120px;
  }
`;

const ZoomValue = styled.span`
  font-size: 0.75rem;
  color: #cbd5f5;
  min-width: 3rem;
  text-align: right;
`;

const ZoomHelper = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
  text-align: right;
  max-width: 420px;

  @media (max-width: 640px) {
    text-align: left;
  }
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const SnappingNotice = styled.div`
  width: 100%;
  display: flex;
  justify-content: flex-end;
`;

const SnappingHelper = styled.div<{ state: 'idle' | 'snapped' | 'free' }>`
  max-width: 420px;
  font-size: 0.75rem;
  color: #f8fafc;
  background: ${({ state }) => {
    switch (state) {
      case 'snapped':
        return 'linear-gradient(135deg, #22c55e, #16a34a)';
      case 'free':
        return 'linear-gradient(135deg, #475569, #334155)';
      default:
        return 'linear-gradient(135deg, #0ea5e9, #0284c7)';
    }
  }};
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.3);
  transition: background 0.3s ease;
`;

interface TimelineHeaderProps {
  context: TimelineRenderContext;
  state: TimelineRenderState;
  handlers: TimelineEventHandlers;
  rippleEditEnabled: boolean;
  onRippleEditToggle: () => void;
  zoomToFit: () => void;
}

const SHORTCUT_ENTRIES = [
  {
    id: 'play-pause',
    keys: 'Space',
    descriptionJa: '再生と一時停止を切り替えます',
    descriptionEn: 'Toggle playback'
  },
  {
    id: 'save',
    keys: 'Ctrl / Cmd + S',
    descriptionJa: '現在のプロジェクトを保存します',
    descriptionEn: 'Save the current project'
  },
  {
    id: 'export',
    keys: 'Ctrl / Cmd + E',
    descriptionJa: '書き出しダイアログを開きます',
    descriptionEn: 'Open the export dialog'
  },
  {
    id: 'undo',
    keys: 'Ctrl / Cmd + Z',
    descriptionJa: '1つ前の操作を取り消します',
    descriptionEn: 'Undo the previous action'
  },
  {
    id: 'redo',
    keys: 'Ctrl / Cmd + Shift + Z',
    descriptionJa: '取り消した操作をやり直します',
    descriptionEn: 'Redo the last undone action'
  },
  {
    id: 'zoom-in',
    keys: 'Ctrl / Cmd + =',
    descriptionJa: 'タイムラインを拡大します',
    descriptionEn: 'Zoom in on the timeline'
  },
  {
    id: 'zoom-out',
    keys: 'Ctrl / Cmd + -',
    descriptionJa: 'タイムラインを縮小します',
    descriptionEn: 'Zoom out on the timeline'
  },
  {
    id: 'zoom-fit',
    keys: 'Ctrl / Cmd + 0',
    descriptionJa: '全体が見えるようにズームをリセットします',
    descriptionEn: 'Zoom to fit the entire timeline'
  },
  {
    id: 'zoom-wheel',
    keys: 'Shift + Mouse Wheel',
    descriptionJa: 'ポインター位置を基準にズームイン・ズームアウトします',
    descriptionEn: 'Zoom in or out around the pointer anchor'
  },
  {
    id: 'shortcuts-toggle',
    keys: 'Ctrl / Cmd + /',
    descriptionJa: 'ショートカット一覧パネルを開閉します',
    descriptionEn: 'Toggle the keyboard shortcut overlay'
  },
  {
    id: 'playback-faster',
    keys: 'Ctrl / Cmd + ]',
    descriptionJa: '再生速度を0.1xずつ上げます',
    descriptionEn: 'Increase playback speed in 0.1x steps'
  },
  {
    id: 'playback-slower',
    keys: 'Ctrl / Cmd + [',
    descriptionJa: '再生速度を0.1xずつ下げます',
    descriptionEn: 'Decrease playback speed in 0.1x steps'
  },
  {
    id: 'playback-reset',
    keys: 'Ctrl / Cmd + \\',
    descriptionJa: '再生速度を1xにリセットします',
    descriptionEn: 'Reset playback speed to 1x'
  },
  {
    id: 'step-backward',
    keys: ', (Comma)',
    descriptionJa: '1フレーム戻ります',
    descriptionEn: 'Step backward one frame'
  },
  {
    id: 'step-forward',
    keys: '. (Period)',
    descriptionJa: '1フレーム進めます',
    descriptionEn: 'Step forward one frame'
  },
  {
    id: 'skip-start',
    keys: 'Home',
    descriptionJa: 'タイムラインの開始位置に移動します',
    descriptionEn: 'Skip to the start of the timeline'
  },
  {
    id: 'skip-end',
    keys: 'End',
    descriptionJa: 'タイムラインの終了位置に移動します',
    descriptionEn: 'Skip to the end of the timeline'
  },
  {
    id: 'loop-toggle',
    keys: 'L',
    descriptionJa: 'ループ再生を切り替えます',
    descriptionEn: 'Toggle loop playback'
  },
  {
    id: 'loop-set-in',
    keys: 'Shift + I',
    descriptionJa: '現在の再生位置をループ開始点に設定します',
    descriptionEn: 'Set loop start to the current playhead position'
  },
  {
    id: 'loop-set-out',
    keys: 'Shift + O',
    descriptionJa: '現在の再生位置をループ終了点に設定します',
    descriptionEn: 'Set loop end to the current playhead position'
  },
  {
    id: 'ripple-toggle',
    keys: 'Toolbar toggle',
    descriptionJa: 'タイムラインのリップル編集ボタンでオンとオフを切り替えます',
    descriptionEn: 'Use the timeline toolbar button to toggle ripple editing'
  }
];

export const TimelineHeader: React.FC<TimelineHeaderProps> = ({
  context,
  state,
  handlers,
  rippleEditEnabled,
  onRippleEditToggle,
  zoomToFit
}) => {
  const rippleHelperJa = rippleEditEnabled
    ? 'リップル編集が有効です。選択クリップの移動に追随して後続クリップがずれます。'
    : 'リップル編集は無効です。選択クリップのみ移動し、他のクリップは固定されます。';

  const rippleHelperEn = rippleEditEnabled
    ? 'Ripple edit is enabled. Dragging a clip shifts the following clips automatically.'
    : 'Ripple edit is disabled. Only the selected clip moves while others stay anchored.';

  return (
    <TimelineHeaderWrapper>
      <TimelineHeaderMain>
        <TimelineToolbar>
          <ZoomControls
            role="group"
            aria-labelledby="timeline-zoom-label"
            aria-describedby="timeline-zoom-hint timeline-zoom-value"
          >
            <VisuallyHidden id="timeline-zoom-label">
              Timeline zoom controls / タイムラインズーム操作
            </VisuallyHidden>
            <ZoomButton
              type="button"
              aria-label="Zoom out timeline / タイムラインを縮小"
              title="Zoom out"
              aria-keyshortcuts="Control+-"
              aria-describedby="timeline-zoom-hint timeline-zoom-value"
              onClick={handlers.onZoomIn}
            >
              -
            </ZoomButton>
            <ZoomSlider
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={context.zoom}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                handlers.onZoomChange(Number(event.target.value))
              }
              aria-label="Timeline zoom level / タイムラインのズームレベル"
              aria-describedby="timeline-zoom-hint timeline-zoom-value"
              aria-valuemin={0.25}
              aria-valuemax={4}
              aria-valuenow={Number(context.zoom.toFixed(2))}
              aria-valuetext={`${Math.round(context.zoom * 100)}%`}
            />
            <ZoomButton
              type="button"
              aria-label="Zoom in timeline / タイムラインを拡大"
              title="Zoom in"
              aria-keyshortcuts="Control+="
              aria-describedby="timeline-zoom-hint timeline-zoom-value"
              onClick={handlers.onZoomOut}
            >
              +
            </ZoomButton>
            <ZoomButton
              type="button"
              aria-label="Zoom to fit timeline / タイムライン全体を表示"
              title="Zoom to fit"
              aria-keyshortcuts="Control+0"
              aria-describedby="timeline-zoom-hint timeline-zoom-value"
              onClick={zoomToFit}
            >
              Fit
            </ZoomButton>
            <ZoomValue
              id="timeline-zoom-value"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              aria-label={`Zoom level ${Math.round(context.zoom * 100)} percent / ズームレベル${Math.round(context.zoom * 100)}パーセント`}
            >
              {`${Math.round(context.zoom * 100)}%`}
            </ZoomValue>
          </ZoomControls>
          <ZoomHelper id="timeline-zoom-hint">
            Timeline zoom can be adjusted using the minus/plus buttons, slider, or Shift + Mouse Wheel. Zooming keeps the pointer focus anchored.
            タイムラインのズームはマイナス・プラスボタン、スライダー、またはShift + ホイール操作で行います。ポインター位置を基準にズームします。
          </ZoomHelper>
          {state.clipboardError && (
            <ZoomHelper role="status" aria-live="polite" style={{ color: '#f87171' }}>
              {state.clipboardError}
            </ZoomHelper>
          )}
          <ShortcutControls>
            <ShortcutButton
              type="button"
              onClick={handlers.onShortcutsToggle}
              aria-expanded={state.showShortcuts}
              aria-controls="timeline-shortcuts-panel"
              aria-keyshortcuts="Control+/"
              aria-label="Toggle shortcut overlay"
              title="Toggle shortcut overlay"
            >
              ⌨︎ Shortcuts / ショートカット
            </ShortcutButton>
            <RippleControls>
              <RippleToggleRow>
                <RippleToggleButton
                  active={rippleEditEnabled}
                  onClick={onRippleEditToggle}
                  aria-pressed={rippleEditEnabled}
                  aria-label="Toggle ripple edit mode"
                  title="Toggle ripple edit mode"
                >
                  🔁 Ripple Edit / リップル編集
                </RippleToggleButton>
                <RippleStateTag active={rippleEditEnabled} aria-live="polite">
                  {rippleEditEnabled ? 'ON / 有効' : 'OFF / 無効'}
                </RippleStateTag>
              </RippleToggleRow>
              <RippleHelper aria-live="polite" aria-atomic="true">
                {rippleHelperJa} {rippleHelperEn}
              </RippleHelper>
            </RippleControls>
            <VisuallyHidden id="timeline-snapping-hint">
              Clips snap to the timeline grid by default. Hold Shift while dragging to move freely.
              クリップは既定でタイムラインのグリッドにスナップします。ドラッグ中にShiftキーを押すと自由に移動できます。
            </VisuallyHidden>
            <SnappingNotice>
              {state.isDragging && (
                <SnappingHelper
                  state={state.snappingState}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-describedby="timeline-snapping-hint"
                >
                  {state.snappingState === 'snapped' ? (
                    <span lang="ja" aria-label="クリップがタイムライングリッドにスナップしました。Shiftキーでスナップを一時的に無効化できます。">
                      クリップがタイムライングリッドにスナップしました。Shiftキーでスナップを一時的に無効化できます。
                    </span>
                  ) : (
                    <span lang="ja" aria-label="Shiftキーを押している間はスナップが一時的に無効化されます。キーを放すとスナップが再び有効になります。">
                      Shiftキーを押している間はスナップが一時的に無効化されます。キーを放すとスナップが再び有効になります。
                    </span>
                  )}
                  <span lang="en" aria-label="Clip snapped to the timeline grid. Hold Shift to temporarily disable snapping.">
                    {state.snappingState === 'snapped'
                      ? 'Clip snapped to the timeline grid. Hold Shift to temporarily disable snapping.'
                      : 'Snapping is temporarily disabled while holding Shift. Release the key to re-enable timeline snapping.'}
                  </span>
                  <VisuallyHidden>{/* snappingAriaMessage will be handled by parent */}</VisuallyHidden>
                </SnappingHelper>
              )}
            </SnappingNotice>
          </ShortcutControls>
        </TimelineToolbar>
        {state.showShortcuts && (
          <ShortcutsPanel
            id="timeline-shortcuts-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Timeline keyboard shortcuts"
          >
            <ShortcutsHeader>
              <ShortcutButton type="button" onClick={handlers.onShortcutsToggle} aria-label="Close shortcut panel">
                × Close
              </ShortcutButton>
            </ShortcutsHeader>
            <ShortcutList>
              {SHORTCUT_ENTRIES.map((shortcut) => (
                <React.Fragment key={shortcut.id}>
                  <ShortcutTerm>{shortcut.keys}</ShortcutTerm>
                  <ShortcutDefinition>
                    {shortcut.descriptionJa}
                    <br />
                    {shortcut.descriptionEn}
                  </ShortcutDefinition>
                </React.Fragment>
              ))}
            </ShortcutList>
          </ShortcutsPanel>
        )}
      </TimelineHeaderMain>
    </TimelineHeaderWrapper>
  );
};
