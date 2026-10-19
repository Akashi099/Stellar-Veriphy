import type { ApiResponse, VerificationNotification } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

function getStoredNotifications(): VerificationNotification[] {
  if (typeof globalThis !== "undefined" && "notifications" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).notifications as VerificationNotification[];
  }
  return [];
}

function setStoredNotifications(notifications: VerificationNotification[]) {
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as Record<string, VerificationNotification[]>).notifications = notifications;
  }
}

export async function GET(): Promise<NextResponse<ApiResponse<VerificationNotification[]>>> {
  try {
    const notifications = getStoredNotifications();
    return NextResponse.json({ success: true, data: notifications });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}
