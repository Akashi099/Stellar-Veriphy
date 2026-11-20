"use client";

import { usePathname } from "next/navigation";
import { useEffect,useState } from "react";

import { Spinner } from "@/components/ui/Spinner";

interface PageTransitionLoaderProps {
  delay?: number;
  minimumDuration?: number;
}

/**
 * Global page transition loader component
 */
export function PageTransitionLoader({
  delay = 300,
  minimumDuration = 500,
}: PageTransitionLoaderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    const startTime = Date.now();
    setIsLoading(true);
    setProgress(0);

    // Simulate progress updates
    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + Math.random() * 20;
        return newProgress > 90 ? 90 : newProgress;
      });
    }, 100);

    // Handle route changes
    const handleRouteChangeStart = () => {
      setIsLoading(true);
      setProgress(0);
    };

    const handleRouteChangeComplete = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minimumDuration - elapsed);

      setProgress(100);

      setTimeout(() => {
        clearInterval(interval);
        setIsLoading(false);
        setProgress(0);
      }, remaining);
    };

    // Simulate route change completion after delay
    const timeout = setTimeout(handleRouteChangeComplete, delay);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [pathname, delay, minimumDuration]);

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm"
      role="alert"
      aria-busy="true"
      aria-live="assertive"
      aria-label="Page transition in progress"
    >
      <div className="relative">
        <Spinner size="lg" label="Loading page..." />

        {/* Animated border */}
        <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 border-r-blue-500 rounded-full animate-spin motion-reduce:animate-none"></div>
      </div>

      <div className="mt-6 max-w-md text-center">
        <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">Loading content...</p>

        {/* Progress indicator */}
        <div className="w-64 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Loading progress: ${Math.round(progress)}%`}
          />
        </div>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {progress < 30 && "Initializing..."}
          {progress >= 30 && progress < 60 && "Loading content..."}
          {progress >= 60 && progress < 90 && "Processing data..."}
          {progress >= 90 && "Finalizing..."}
        </p>
      </div>
    </div>
  );
}

/**
 * Hook to show loading state for specific operations
 */
export function useOperationLoader() {
  const [isLoading, setIsLoading] = useState(false);
  const [operationName, setOperationName] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<string>("");
  const [startTime, setStartTime] = useState<number>(0);

  const startOperation = (name: string) => {
    setIsLoading(true);
    setOperationName(name);
    setProgress(0);
    setStartTime(Date.now());
  };

  const updateProgress = (value: number) => {
    setProgress(value);

    // Calculate estimated time remaining
    if (startTime > 0 && value > 0) {
      const elapsed = Date.now() - startTime;
      const estimatedTotal = (elapsed / value) * 100;
      const remaining = estimatedTotal - elapsed;

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      if (minutes > 0) {
        setEstimatedTime(`${minutes}m ${seconds}s`);
      } else {
        setEstimatedTime(`${seconds}s`);
      }
    }
  };

  const completeOperation = () => {
    setProgress(100);

    setTimeout(() => {
      setIsLoading(false);
      setOperationName("");
      setProgress(0);
      setEstimatedTime("");
    }, 1000);
  };

  const cancelOperation = () => {
    setIsLoading(false);
    setOperationName("");
    setProgress(0);
    setEstimatedTime("");
  };

  return {
    isLoading,
    operationName,
    progress,
    estimatedTime,
    startOperation,
    updateProgress,
    completeOperation,
    cancelOperation,
  };
}

/**
 * Component for file upload progress
 */
export function FileUploadProgress({
  fileName,
  progress,
  speed,
  onCancel,
}: {
  fileName: string;
  progress: number;
  speed: string;
  onCancel?: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{fileName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Uploading at {speed}</p>
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
            aria-label="Cancel upload"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600 dark:text-gray-400">Progress</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">
            {Math.round(progress)}%
          </span>
        </div>
        <div
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
