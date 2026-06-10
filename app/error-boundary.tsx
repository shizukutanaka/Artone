/**
 * Artone v3 — Error Boundary
 *
 * React ツリー内の任意のエラーをキャッチして白画面を防ぐ。
 * 再試行 / 再起動 / エラー詳細を表示する。
 */

import React from 'react';
import { color, space, radius, ds, typography } from './design-system';
import { createLogger } from './logger';
import { t } from '../i18n/i18n-manager';

const log = createLogger('ErrorBoundary');

interface Props {
  children: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ errorInfo: info.componentStack ?? '' });
    this.props.onError?.(error, info);
    log.error('Uncaught error', { message: error.message, stack: error.stack?.slice(0, 500) });
  }

  private handleReload = () => window.location.reload();
  private handleReset = () => this.setState({ hasError: false, error: null, errorInfo: '' });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        position: 'fixed', inset: 0, background: color.surface1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: typography.fontFamily.sans, color: color.textPrimary, padding: space[8],
      }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: radius.full,
            background: color.surface3, display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: `0 auto`, marginBottom: space[6], fontSize: 28,
          }}>⚠</div>

          <h1 style={{ ...ds.text('display'), marginBottom: space[3] }}>{t('error.unexpected.title')}</h1>
          <p style={{ ...ds.text('body'), color: color.textSecondary, marginBottom: space[6] }}>
            {t('error.unexpected.body')}
          </p>

          <details style={{ ...ds.panel(), padding: space[4], textAlign: 'left', marginBottom: space[6] }}>
            <summary style={{ ...ds.text('caption'), color: color.textTertiary, cursor: 'pointer', marginBottom: space[2] }}>
              {t('error.details')}
            </summary>
            <pre style={{
              ...ds.text('mono'), color: color.destructive, whiteSpace: 'pre-wrap',
              wordBreak: 'break-all', maxHeight: 200, overflow: 'auto',
              padding: space[3], background: color.surface4, borderRadius: radius.sm,
            }}>
              {this.state.error?.message}{'\n\n'}{this.state.error?.stack?.slice(0, 400)}
            </pre>
          </details>

          <div style={{ display: 'flex', gap: space[3], justifyContent: 'center' }}>
            <button onClick={this.handleReset} style={ds.button('secondary')}>{t('common.retry')}</button>
            <button onClick={this.handleReload} style={ds.button('primary')}>{t('error.restart')}</button>
          </div>
        </div>
      </div>
    );
  }
}
