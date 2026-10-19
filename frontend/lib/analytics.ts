/**
 * Landing Page & CTA Analytics Module
 * 
 * Provides structured tracking for key homepage actions and Call-To-Action (CTA) buttons.
 * Supports campaign attribution (UTM parameters), user segmentation (new vs returning, wallet state),
 * and deduplication to prevent inflated event counts under rapid clicking.
 * 
 * Event Schema & Documentation:
 * - Event: "cta_click" | "landing_cta_click" | "wallet_connect_cta_click"
 * - Payload:
 *   - cta_id: Unique identifier of the clicked element (e.g., "hero_start_verifying")
 *   - cta_label: Human-readable button or link text (e.g., "Start Verifying")
 *   - cta_location: Region of the page ("hero", "cta_section", "nav", "featured_sample")
 *   - target_url: Destination URL if applicable
 *   - user_segment: Categorization of the user ("new_visitor" | "returning_visitor" | "wallet_connected")
 *   - campaign: UTM attribution object { source, medium, campaign, term, content }
 *   - timestamp: ISO 8601 string of the event time
 *   - session_id: Stable session ID across the browser session
 */

export interface CampaignData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer?: string;
}

export type UserSegment = "new_visitor" | "returning_visitor" | "wallet_connected" | "wallet_disconnected";

export interface CtaAnalyticsEvent {
  eventName: "cta_click" | "landing_cta_click" | "wallet_connect_cta_click";
  ctaId: string;
  ctaLabel: string;
  ctaLocation: "hero" | "cta_section" | "nav" | "featured_sample" | "how_it_works" | "footer";
  targetUrl?: string;
  userSegment: UserSegment;
  campaign?: CampaignData;
  timestamp: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

// In-memory event log for debugging, audit, and tests
const eventLog: CtaAnalyticsEvent[] = [];

// Deduplication cache: tracks timestamp of last click per ctaId
const lastClickTimestamps = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 1000; // 1 second threshold

/**
 * Retrieves or initializes a persistent session identifier.
 */
export function getAnalyticsSessionId(): string {
  if (typeof window === "undefined") return "server_session";
  try {
    let sessionId = sessionStorage.getItem("stellar_veriphy_session_id");
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem("stellar_veriphy_session_id", sessionId);
    }
    return sessionId;
  } catch {
    return "fallback_session";
  }
}

/**
 * Extracts campaign parameters from current location search parameters.
 */
export function extractCampaignData(): CampaignData {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const campaign: CampaignData = {};

    const utmSource = params.get("utm_source");
    const utmMedium = params.get("utm_medium");
    const utmCampaign = params.get("utm_campaign");
    const utmTerm = params.get("utm_term");
    const utmContent = params.get("utm_content");

    if (utmSource) campaign.utm_source = utmSource;
    if (utmMedium) campaign.utm_medium = utmMedium;
    if (utmCampaign) campaign.utm_campaign = utmCampaign;
    if (utmTerm) campaign.utm_term = utmTerm;
    if (utmContent) campaign.utm_content = utmContent;
    if (document.referrer) campaign.referrer = document.referrer;

    return campaign;
  } catch {
    return {};
  }
}

/**
 * Determines current user segment based on local storage flags and wallet state.
 */
export function determineUserSegment(isWalletConnected = false): UserSegment {
  if (isWalletConnected) return "wallet_connected";
  if (typeof window === "undefined") return "new_visitor";

  try {
    const hasVisited = localStorage.getItem("stellar_veriphy_visited");
    if (!hasVisited) {
      localStorage.setItem("stellar_veriphy_visited", "true");
      return "new_visitor";
    }
    return "returning_visitor";
  } catch {
    return "new_visitor";
  }
}

/**
 * Core event emitter for CTA analytics.
 * Handles deduplication, payload formatting, window dispatching, and in-memory logging.
 */
export function trackCtaClick(params: {
  ctaId: string;
  ctaLabel: string;
  ctaLocation: CtaAnalyticsEvent["ctaLocation"];
  targetUrl?: string;
  isWalletConnected?: boolean;
  metadata?: Record<string, unknown>;
  customEventName?: CtaAnalyticsEvent["eventName"];
}): boolean {
  if (typeof window === "undefined") return false;

  const now = Date.now();
  const lastClick = lastClickTimestamps.get(params.ctaId) || 0;

  // Deduplication check: ignore rapid consecutive clicks on the same CTA
  if (now - lastClick < DEDUPLICATION_WINDOW_MS) {
    return false;
  }
  lastClickTimestamps.set(params.ctaId, now);

  const event: CtaAnalyticsEvent = {
    eventName: params.customEventName || "landing_cta_click",
    ctaId: params.ctaId,
    ctaLabel: params.ctaLabel,
    ctaLocation: params.ctaLocation,
    targetUrl: params.targetUrl,
    userSegment: determineUserSegment(params.isWalletConnected),
    campaign: extractCampaignData(),
    timestamp: new Date().toISOString(),
    sessionId: getAnalyticsSessionId(),
    metadata: params.metadata,
  };

  eventLog.push(event);

  // Dispatch standard custom DOM event for analytics providers / Google Tag Manager
  try {
    window.dispatchEvent(
      new CustomEvent("stellar_cta_analytics", {
        detail: event,
      })
    );

    // Support window.dataLayer if present
    const anyWindow = window as unknown as { dataLayer?: unknown[] };
    if (Array.isArray(anyWindow.dataLayer)) {
      anyWindow.dataLayer.push({
        event: event.eventName,
        ...event,
      });
    }
  } catch {
    // Graceful silent fail for non-browser or sandbox environments
  }

  return true;
}

/**
 * Accessor for recent analytics events (useful for verification, debugging, or campaign reviews).
 */
export function getRecentAnalyticsEvents(): readonly CtaAnalyticsEvent[] {
  return [...eventLog];
}

/**
 * Clear the internal analytics event log (useful for resetting between reviews/sessions).
 */
export function clearAnalyticsEventLog(): void {
  eventLog.length = 0;
  lastClickTimestamps.clear();
}
