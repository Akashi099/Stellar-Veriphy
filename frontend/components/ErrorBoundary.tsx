"use client";

import React from "react";

import { RetryableError } from "@/components/ui/RetryableError";
import { captureException } from "@/lib/error-tracking/client";
import { describeError } from "@/lib/errors/describeError";

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
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const described = describeError(this.state.error);

      return (
        <RetryableError
          error={this.state.error}
          title={described.title}
          fallbackMessage={described.message}
          onRetry={this.reset}
        />
      );
    }

    return this.props.children;
  }
}