import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Top-level error boundary rendering an accessible recovery alert on uncaught UI errors. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] Uncaught rendering error:', error.message, info.componentStack);
  }

  private readonly handleRetry = (): void => {
    this.props.onReset?.();
    this.setState({ hasError: false });
  };

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="page-width">
        <section className="error-boundary" role="alert" aria-labelledby="error-boundary-heading">
          <h1 id="error-boundary-heading">Something went wrong</h1>
          <p>
            VayuShield AI ran into an unexpected display error. You can retry rendering the dashboard or reload the page.
          </p>
          <div className="error-boundary-actions">
            <button type="button" className="button-primary" onClick={this.handleRetry}>
              Try again
            </button>
            <button type="button" className="button-secondary" onClick={this.handleReload}>
              Reload page
            </button>
          </div>
        </section>
      </main>
    );
  }
}
