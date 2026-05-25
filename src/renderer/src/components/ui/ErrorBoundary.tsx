import { type ErrorInfo, type JSX, type ReactNode, Component } from 'react';

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
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col justify-center items-center bg-warm-charcoal p-8 h-screen text-seasalt select-none">
          <div className="flex justify-center items-center bg-crimson/10 mb-4 rounded-full w-16 h-16">
            <span className="text-crimson text-3xl">⚠</span>
          </div>
          <h1 className="mb-2 font-bold text-seasalt text-xl">
            Something went wrong
          </h1>
          <p className="mb-1 max-w-md text-seasalt-400 text-sm text-center">
            DevWP encountered an unexpected error.
          </p>
          {this.state.error && (
            <p className="mb-4 bg-gunmetal-400 px-4 py-2 rounded max-w-md font-mono text-crimson text-xs break-all">
              {this.state.error.message}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="bg-pumpkin hover:bg-pumpkin-600 px-4 py-2 rounded font-semibold text-warm-charcoal transition-colors cursor-pointer"
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
