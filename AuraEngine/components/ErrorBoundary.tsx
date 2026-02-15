import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const isDev = import.meta.env.DEV;

    return (
      <div className="flex items-center justify-center min-h-[320px] p-6">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm max-w-md w-full text-center">
          <div className="px-6 py-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 mx-auto mb-5">
              <AlertTriangle size={22} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900 font-heading">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">
              An unexpected error occurred. Please try again or refresh the page.
            </p>
            {isDev && this.state.error && (
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-3 text-left">
                <p className="text-xs font-mono text-slate-600 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="mt-6">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center justify-center font-medium rounded-xl outline-none transition-all duration-150 ease-out bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-200 h-9 px-4 text-sm gap-2"
              >
                <RefreshCw size={16} />
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
