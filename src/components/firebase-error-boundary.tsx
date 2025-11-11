import React from 'react';

interface FirebaseErrorBoundaryProps {
  children: React.ReactNode;
  onError: (error: Error) => void;
  fallback: () => React.ReactNode;
}

interface DefaultFirebaseErrorFallbackProps {
  error: Error;
  retry: () => void;
}

// Simple error boundary implementation
export class ErrorBoundary extends React.Component<
  FirebaseErrorBoundaryProps,
  { hasError: boolean }
> {
  constructor(props: FirebaseErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback();
    }

    return this.props.children;
  }
}

// Default fallback component
export function DefaultFirebaseErrorFallback({ error, retry }: DefaultFirebaseErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
      <div className="max-w-md">
        <h2 className="text-2xl font-semibold text-foreground mb-4">
          Erro de Conexão
        </h2>
        <p className="text-muted-foreground mb-6">
          {error.message || 'Ocorreu um erro ao conectar com os serviços. Tente novamente.'}
        </p>
        <button
          onClick={retry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Tentar Novamente
        </button>
      </div>
    </div>
  );
}

// Higher-order component for error boundaries
export function withFirebaseErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<DefaultFirebaseErrorFallbackProps>
) {
  return function WrappedComponent(props: P) {
    const [error, setError] = React.useState<Error | null>(null);

    const retry = React.useCallback(() => {
      setError(null);
    }, []);

    if (error) {
      const FallbackComponent = fallback || DefaultFirebaseErrorFallback;
      return <FallbackComponent error={error} retry={retry} />;
    }

    return (
      <ErrorBoundary
        onError={setError}
        fallback={() => null}
      >
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}