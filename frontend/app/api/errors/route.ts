/**
 * Error Tracking API Endpoint
 *
 * Receives error reports from the frontend and logs them
 */

import { NextRequest, NextResponse } from "next/server";

interface ErrorReport {
  message: string;
  level: "fatal" | "error" | "warning" | "info";
  timestamp: string;
  environment?: string;
  url?: string;
  userAgent?: string;
  context?: Record<string, any>;
  fingerprint?: string;
}

/**
 * POST /api/errors - Report an error
 */
export async function POST(request: NextRequest) {
  try {
    const body: ErrorReport = await request.json();

    // Validate required fields
    if (!body.message || !body.level) {
      return NextResponse.json(
        {
          error: "Missing required fields: message, level",
        },
        { status: 400 }
      );
    }

    // Create error log entry
    const errorLog = {
      id: generateErrorId(),
      ...body,
      receivedAt: new Date().toISOString(),
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
    };

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("[Error Report]", errorLog);
    }

    // In production, you would send this to an error tracking service
    // like Sentry, LogRocket, etc.
    if (process.env.ERROR_TRACKING_ENABLED === "true") {
      await sendToErrorTrackingService(errorLog);
    }

    // Store in database or log file
    if (process.env.ERROR_LOGGING_ENABLED === "true") {
      await logErrorToDatabase(errorLog);
    }

    return NextResponse.json(
      {
        success: true,
        id: errorLog.id,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Error processing error report:", error);
    return NextResponse.json(
      {
        error: "Failed to process error report",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/errors/sourcemaps - Upload source maps
 */
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData();

    const release = formData.get("release") as string;
    const url = formData.get("url") as string;
    const sourceMap = formData.get("sourceMap") as File;
    const source = formData.get("source") as File;

    if (!release || !url || !sourceMap) {
      return NextResponse.json(
        {
          error: "Missing required fields: release, url, sourceMap",
        },
        { status: 400 }
      );
    }

    // Store source maps for later use in stack trace processing
    const sourceMapContent = await sourceMap.text();
    const sourceContent = source ? await source.text() : "";

    if (process.env.ERROR_TRACKING_ENABLED === "true") {
      await storeSourceMap({
        release,
        url,
        sourceMap: sourceMapContent,
        source: sourceContent,
      });
    }

    return NextResponse.json(
      {
        success: true,
        release,
        url,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error uploading source maps:", error);
    return NextResponse.json(
      {
        error: "Failed to upload source maps",
      },
      { status: 500 }
    );
  }
}

/**
 * Generate unique error ID
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Send error to external tracking service (e.g., Sentry)
 */
async function sendToErrorTrackingService(errorLog: any) {
  try {
    const dsn = process.env.ERROR_TRACKING_DSN;
    if (!dsn) return;

    // Parse DSN to get Sentry endpoint
    const dsnUrl = new URL(dsn);
    const projectId = dsnUrl.pathname.split("/").pop();
    const apiKey = dsnUrl.username;

    const sentryUrl = `https://${dsnUrl.hostname}/api/${projectId}/store/`;

    const event = {
      message: errorLog.message,
      level: errorLog.level,
      environment: errorLog.environment,
      tags: {
        level: errorLog.level,
      },
      contexts: {
        browser: {
          name: "Unknown",
          version: "Unknown",
        },
      },
      request: {
        url: errorLog.url,
        headers: {
          "User-Agent": errorLog.userAgent,
        },
      },
      timestamp: new Date(errorLog.timestamp).getTime() / 1000,
      ...errorLog.context,
    };

    await fetch(sentryUrl, {
      method: "POST",
      headers: {
        "X-Sentry-Auth": `Sentry sentry_key=${apiKey}, sentry_version=7`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }).catch(() => {
      // Silently fail if Sentry is not available
    });
  } catch (error) {
    console.error("Failed to send to error tracking service:", error);
  }
}

/**
 * Log error to database
 */
async function logErrorToDatabase(errorLog: any) {
  try {
    // TODO: Implement database logging
    // This would typically insert the error into a database table
    console.log("[Database] Logging error:", errorLog.id);
  } catch (error) {
    console.error("Failed to log error to database:", error);
  }
}

/**
 * Store source map for later use
 */
async function storeSourceMap(data: {
  release: string;
  url: string;
  sourceMap: string;
  source: string;
}) {
  try {
    // TODO: Implement source map storage
    // This could store to S3, database, or local filesystem
    console.log("[SourceMaps] Storing source map for:", data.url);
  } catch (error) {
    console.error("Failed to store source map:", error);
  }
}
