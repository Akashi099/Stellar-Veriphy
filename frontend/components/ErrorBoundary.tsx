"use client";

import React from "react";

import { RetryableError } from "@/components/ui/RetryableError";
import { captureException } from "@/lib/error-tracking/client";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureException(error, {
      source: "react_error_boundary",
      componentStack: errorInfo.componentStack,
    });

    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  private reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <RetryableError
            error={this.state.error}
            title="Something went wrong"
            fallbackMessage="We've logged this error and will look into it."
            onRetry={this.reset}
          />
        )
      );
    }

    return this.props.children;
  }
}
