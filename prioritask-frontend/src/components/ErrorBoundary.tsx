import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error captured by ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/dashboard";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="container mt-5 text-center">
          <div className="card shadow p-4 mx-auto" style={{ maxWidth: "500px" }}>
            <div className="card-body">
              <span style={{ fontSize: "3rem" }} role="img" aria-label="Error">
                ⚠️
              </span>
              <h3 className="card-title mt-3 text-danger">Algo salió mal</h3>
              <p className="card-text text-muted">
                Ocurrió un error inesperado al renderizar esta sección.
              </p>
              {this.state.error && (
                <div className="alert alert-light text-start small border">
                  <code>{this.state.error.message}</code>
                </div>
              )}
              <button
                className="btn btn-primary mt-3"
                onClick={this.handleReset}
              >
                Volver al Panel Principal
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
