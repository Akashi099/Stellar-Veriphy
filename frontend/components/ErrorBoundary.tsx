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

type ErrorKind = "capability" | "session" | "generic";

interface CapabilityInfo {
  capability: string;
  guidance: string;
}

const CAPABILITY_PATTERNS: Array<{ pattern: RegExp; capability: string; guidance: string }> = [
  {
    pattern: /localstorage|sessionstorage|storage is not defined|storage access/i,
    capability: "browser storage (localStorage/sessionStorage)",
    guidance:
      "Your browser is blocking or does not support local storage, which we use to keep you signed in. Enable storage/cookies for this site, or try a different browser.",
  },
  {
    pattern: /indexeddb/i,
    capability: "IndexedDB",
    guidance:
      "Your browser does not support IndexedDB, which some features rely on. Try updating your browser or switching to a modern one.",
  },
  {
    pattern: /crypto\.subtle|subtlecrypto|webcrypto/i,
    capability: "Web Crypto API",
    guidance:
      "Your browser does not support the Web Crypto API, which is required for secure authentication. Please update your browser.",
  },
  {
    pattern: /fetch is not defined|network request failed|unsupported.*fetch/i,
    capability: "Fetch API",
    guidance:
      "Your browser does not support the Fetch API, which is required to load data. Please update your browser.",
  },
  {
    pattern: /broadcastchannel/i,
    capability: "BroadcastChannel",
    guidance:
      "Your browser does not support BroadcastChannel, which we use to sync your session across tabs. Some cross-tab features may not work.",
  },
  {
    pattern: /matchmedia|resizeobserver|intersectionobserver/i,
    capability: "modern browser APIs (ResizeObserver/IntersectionObserver)",
    guidance:
      "Your browser is missing modern APIs this app relies on. Please update to a current version of Chrome, Firefox, Safari, or Edge.",
  },
];

const SESSION_PATTERNS: RegExp[] = [
  /session.*(persist|restore|hydrat)/i,
  /persist.*session/i,
  /failed to (restore|load|read) (the )?session/i,
  /auth.*(persist|restore|hydrat)/i,
  /token.*(persist|restore|storage)/i,
];

function detectErrorKind(error?: Error): ErrorKind {
  if (!error) {
    return "generic";
  }

  const message = `${error.name} ${error.message}`;

  if (CAPABILITY_PATTERNS.some(({ pattern }) => pattern.test(message))) {
    return "capability";
  }

  if (SESSION_PATTERNS.some((pattern) => pattern.test(message))) {
    return "session";
  }

  return "generic";
}

function detectCapability(error?: Error): CapabilityInfo | undefined {
  if (!error) {
    return undefined;
  }

  const message = `${error.name} ${error.message}`;
  const match = CAPABILITY_PATTERNS.find(({ pattern }) => pattern.test(message));

  if (!match) {
    return undefined;
  }

  return { capability: match.capability, guidance: match.guidance };
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
      errorKind: detectErrorKind(error),
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
  private retrySession = () => {
    this.reset();
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  private renderFallback() {
    if (this.props.fallback) {
      return this.props.fallback;
    }

    const kind = detectErrorKind(this.state.error);

    if (kind === "capability") {
      const info = detectCapability(this.state.error);
      return (
        <RetryableError
          error={this.state.error}
          title="Your browser is missing a required capability"
          fallbackMessage={
            info
              ? `This app needs ${info.capability}. ${info.guidance}`
              : "Your browser is missing a capability this app requires. Please update your browser or try a different one."
          }
          onRetry={this.reset}
        />
      );
    }

    if (kind === "session") {
      return (
        <RetryableError
          error={this.state.error}
          title="We couldn't restore your session"
          fallbackMessage="Your session could not be restored after reloading. This may be caused by blocked storage or an expired session. Retry to sign in again."
          onRetry={this.retrySession}
        />
      );
    }

    return (
      <RetryableError
        error={this.state.error}
        title="Something went wrong"
        fallbackMessage="We've logged this error and will look into it."
        onRetry={this.reset}
      />
    );
  }

  render() {
    if (this.state.hasError) {
      return this.renderFallback();
    }

    return this.props.children;
  }
}