'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}
interface State {
  hasError: boolean;
  message?: string;
}

/** App-level error boundary — contains render failures, never blank-screens. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', err, info.componentStack);
  }

  private reset = () => {
    this.setState({ hasError: false, message: undefined });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        className="glass flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 p-8 text-center"
      >
        <AlertTriangle className="h-7 w-7 text-red-400" />
        <p className="text-sm font-semibold text-gray-100">Something went wrong</p>
        <p className="max-w-md text-xs text-gray-500">
          {this.state.message ?? 'An unexpected error occurred while rendering this section.'}
        </p>
        <button
          onClick={this.reset}
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-xs font-medium text-gray-200 hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }
}
