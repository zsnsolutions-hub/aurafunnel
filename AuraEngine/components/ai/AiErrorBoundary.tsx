/**
 * AI-specific ErrorBoundary for /portal/ai route.
 *
 * - Catches ChunkLoadError, network errors, and render crashes
 * - Shows "Retry stream" + "Restore last draft" instead of blank page
 * - Never triggers window.location.reload()
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface AiErrorBoundaryProps {
  children: ReactNode;
  onRetryStream?: () => void;
  onRestoreDraft?: () => void;
  lastDraft?: string;
}

interface AiErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

class AiErrorBoundary extends Component<AiErrorBoundaryProps, AiErrorBoundaryState> {
  constructor(props: AiErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): AiErrorBoundaryState {
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Loading CSS chunk');

    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      '[AiErrorBoundary] Caught:',
      error.message,
      '\nComponent:',
      errorInfo.componentStack
    );
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, isChunkError: false });
    this.props.onRetryStream?.();
  };

  handleRestore = (): void => {
    this.setState({ hasError: false, error: null, isChunkError: false });
    this.props.onRestoreDraft?.();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex items-center justify-center min-h-[400px] p-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm max-w-md w-full text-center">
          <div className="px-6 py-8">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" /><path d="M12 17h.01" />
              </svg>
            </div>

            <h2 className="text-sm font-semibold text-slate-900">
              {this.state.isChunkError
                ? 'App updated — please reload'
                : 'AI Assistant encountered an error'}
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
              {this.state.isChunkError
                ? 'A new version is available. Your conversation will be restored.'
                : this.state.error?.message || 'An unexpected error occurred.'}
            </p>

            {import.meta.env.DEV && this.state.error && (
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-left">
                <p className="text-xs font-mono text-red-600 break-words font-semibold mb-1">
                  {this.state.error.message}
                </p>
                <pre className="text-[10px] font-mono text-slate-500 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center font-medium rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm h-9 px-4 text-sm gap-2 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
                {this.state.isChunkError ? 'Reload' : 'Retry'}
              </button>

              {this.props.lastDraft && (
                <button
                  onClick={this.handleRestore}
                  className="inline-flex items-center justify-center font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm h-9 px-4 text-sm gap-2 transition-all"
                >
                  Restore last draft
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default AiErrorBoundary;
