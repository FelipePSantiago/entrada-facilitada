"use client";

import React, { Component, ReactNode } from "react";
import { getErrorMessage } from "@/lib/utils";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const errorMessage = getErrorMessage(error);
    console.error("Erro capturado pelo ErrorBoundary:", errorMessage, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center h-screen bg-background text-center p-4">
            <div className="max-w-md">
                <h1 className="text-2xl font-bold text-destructive mb-2">Oops! Algo deu errado.</h1>
                <p className="text-muted-foreground mb-4">
                    Nossa equipe foi notificada. Por favor, tente recarregar a página ou volte mais tarde.
                </p>
                <button 
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        // Tenta limpar o cache relacionado a chunks antes de recarregar
                        window.location.reload();
                      }
                    }}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                >
                    Recarregar Página
                </button>
            </div>
        </div>
      );
    }
    return this.props.children;
  }
}
