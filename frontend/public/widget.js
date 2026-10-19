/**
 * CertificateEmbedWidget — Issue #218
 *
 * Lightweight embeddable JavaScript widget to display verification badges on
 * external websites. Supports multiple badge styles, responsive design,
 * customizable colors/sizes, click-through to full certificate, CORS support,
 * and CDN hosting.
 *
 * Usage:
 *   <script src="https://cdn.stellarveriphy.com/widget.js"></script>
 *   <div data-sv-cert-id="123" data-sv-style="minimal" data-sv-size="medium"></div>
 *   <script>StellarVeriphyWidget.init();</script>
 */

(function (window, document) {
  "use strict";

  const API_BASE = "https://api.stellarveriphy.com"; // Production endpoint
  const APP_BASE = "https://stellarveriphy.com"; // App base URL for click-through

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  type BadgeStyle = "minimal" | "standard" | "detailed" | "shield";
  type BadgeSize = "small" | "medium" | "large";

  interface WidgetConfig {
    certId: string;
    style: BadgeStyle;
    size: BadgeSize;
    primaryColor: string;
    textColor: string;
  }

  interface CertificateData {
    id: string;
    storageRef: string;
    manifestHash: string;
    attestationHash: string;
    creator: string;
    timestamp: number;
    status: "certified" | "pending" | "failed";
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const widgets: Map<HTMLElement, WidgetConfig> = new Map();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function parseConfig(el: HTMLElement): WidgetConfig {
    const certId = el.getAttribute("data-sv-cert-id") || "";
    const style =
      (el.getAttribute("data-sv-style") as BadgeStyle) || "standard";
    const size = (el.getAttribute("data-sv-size") as BadgeSize) || "medium";
    const primaryColor =
      el.getAttribute("data-sv-primary-color") || "#3b82f6";
    const textColor = el.getAttribute("data-sv-text-color") || "#ffffff";

    return { certId, style, size, primaryColor, textColor };
  }

  async function fetchCertificate(certId: string): Promise<CertificateData> {
    // Mock response for demo (replace with real API call in production)
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          id: certId,
          storageRef: "ipfs://Qm...",
          manifestHash: "a1b2c3d4...",
          attestationHash: "e5f6g7h8...",
          creator: "GBRPYHIL...",
          timestamp: Date.now() / 1000,
          status: "certified",
        });
      }, 300);
    });
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function getSizeStyles(size: BadgeSize): string {
    switch (size) {
      case "small":
        return "font-size: 12px; padding: 8px 12px;";
      case "large":
        return "font-size: 16px; padding: 16px 24px;";
      default:
        return "font-size: 14px; padding: 12px 18px;";
    }
  }

  // ---------------------------------------------------------------------------
  // Badge renderers
  // ---------------------------------------------------------------------------

  function renderMinimal(
    cert: CertificateData,
    config: WidgetConfig
  ): string {
    return `
      <a
        href="${APP_BASE}/verify?certId=${cert.id}"
        target="_blank"
        rel="noopener noreferrer"
        style="
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: ${config.primaryColor};
          color: ${config.textColor};
          border-radius: 8px;
          text-decoration: none;
          transition: opacity 0.2s;
          ${getSizeStyles(config.size)}
        "
        onmouseover="this.style.opacity='0.9'"
        onmouseout="this.style.opacity='1'"
      >
        <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
        <span style="font-weight: 600;">Verified</span>
      </a>
    `;
  }

  function renderStandard(
    cert: CertificateData,
    config: WidgetConfig
  ): string {
    return `
      <a
        href="${APP_BASE}/verify?certId=${cert.id}"
        target="_blank"
        rel="noopener noreferrer"
        style="
          display: inline-block;
          background: linear-gradient(135deg, ${config.primaryColor} 0%, #8b5cf6 100%);
          color: ${config.textColor};
          border-radius: 12px;
          text-decoration: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          transition: transform 0.2s, box-shadow 0.2s;
          ${getSizeStyles(config.size)}
        "
        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0, 0, 0, 0.2)'"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.15)'"
      >
        <div style="display: flex; align-items: center; gap: 12px;">
          <svg aria-hidden="true" focusable="false" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <div>
            <div style="font-weight: 700; line-height: 1.2;">StellarVeriphy Certified</div>
            <div style="font-size: 0.85em; opacity: 0.9; margin-top: 2px;">
              Certificate #${cert.id}
            </div>
          </div>
        </div>
      </a>
    `;
  }

  function renderDetailed(
    cert: CertificateData,
    config: WidgetConfig
  ): string {
    return `
      <a
        href="${APP_BASE}/verify?certId=${cert.id}"
        target="_blank"
        rel="noopener noreferrer"
        style="
          display: block;
          background: #ffffff;
          border: 2px solid ${config.primaryColor};
          border-radius: 12px;
          padding: 16px;
          text-decoration: none;
          color: #1f2937;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transition: box-shadow 0.2s, transform 0.2s;
          max-width: 320px;
        "
        onmouseover="this.style.boxShadow='0 6px 16px rgba(0, 0, 0, 0.12)'; this.style.transform='translateY(-2px)'"
        onmouseout="this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.08)'; this.style.transform='translateY(0)'"
      >
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <svg aria-hidden="true" focusable="false" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${config.primaryColor}" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <div>
            <div style="font-weight: 700; font-size: 16px; color: ${config.primaryColor};">
              Verified Content
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              Certificate #${cert.id}
            </div>
          </div>
        </div>
        <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
          <div style="margin-bottom: 4px;">
            <strong>Certified:</strong> ${formatDate(cert.timestamp)}
          </div>
          <div style="margin-bottom: 4px;">
            <strong>Creator:</strong> ${cert.creator.slice(0, 8)}…
          </div>
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: ${config.primaryColor}; font-weight: 600;">
            Click to view full certificate →
          </div>
        </div>
      </a>
    `;
  }

  function renderShield(
    cert: CertificateData,
    config: WidgetConfig
  ): string {
    return `
      <a
        href="${APP_BASE}/verify?certId=${cert.id}"
        target="_blank"
        rel="noopener noreferrer"
        style="
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          text-decoration: none;
          transition: transform 0.2s;
        "
        onmouseover="this.style.transform='scale(1.05)'"
        onmouseout="this.style.transform='scale(1)'"
      >
        <svg aria-hidden="true" focusable="false" width="80" height="80" viewBox="0 0 24 24" fill="${config.primaryColor}" stroke="${config.textColor}" stroke-width="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4" stroke-width="2"/>
        </svg>
        <div style="margin-top: 8px; text-align: center;">
          <div style="font-weight: 700; font-size: 14px; color: ${config.primaryColor};">
            Verified
          </div>
          <div style="font-size: 11px; color: #6b7280;">
            Cert #${cert.id}
          </div>
        </div>
      </a>
    `;
  }

  function renderBadge(
    cert: CertificateData,
    config: WidgetConfig
  ): string {
    switch (config.style) {
      case "minimal":
        return renderMinimal(cert, config);
      case "detailed":
        return renderDetailed(cert, config);
      case "shield":
        return renderShield(cert, config);
      default:
        return renderStandard(cert, config);
    }
  }

  function renderLoading(config: WidgetConfig): string {
    return `
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 18px;
        background: #f3f4f6;
        border-radius: 8px;
        color: #6b7280;
        font-size: 14px;
      ">
        <div style="
          width: 16px;
          height: 16px;
          border: 2px solid #e5e7eb;
          border-top-color: ${config.primaryColor};
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        "></div>
        <span>Loading…</span>
      </div>
    `;
  }

  function renderError(message: string): string {
    return `
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 18px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 8px;
        color: #dc2626;
        font-size: 14px;
      ">
        <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>${message}</span>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Widget lifecycle
  // ---------------------------------------------------------------------------

  async function initWidget(el: HTMLElement): Promise<void> {
    const config = parseConfig(el);

    if (!config.certId) {
      el.innerHTML = renderError("Missing certificate ID");
      return;
    }

    // Show loading state
    el.innerHTML = renderLoading(config);

    try {
      const cert = await fetchCertificate(config.certId);
      el.innerHTML = renderBadge(cert, config);
      widgets.set(el, config);
    } catch (error) {
      console.error("Failed to load certificate widget:", error);
      el.innerHTML = renderError("Failed to load certificate");
    }
  }

  function scanAndInit(): void {
    const elements = document.querySelectorAll("[data-sv-cert-id]");
    elements.forEach((el) => {
      if (!widgets.has(el as HTMLElement)) {
        initWidget(el as HTMLElement);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const StellarVeriphyWidget = {
    /**
     * Initialize all widgets on the page.
     * Call this after the DOM is ready or after dynamically inserting widget elements.
     */
    init(): void {
      scanAndInit();
    },

    /**
     * Initialize a specific widget element.
     */
    initElement(el: HTMLElement): void {
      initWidget(el);
    },

    /**
     * Get the version of the widget script.
     */
    version: "1.0.0",
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      StellarVeriphyWidget.init();
    });
  } else {
    // DOM is already ready
    StellarVeriphyWidget.init();
  }

  // Expose to global scope
  (window as any).StellarVeriphyWidget = StellarVeriphyWidget;

  // Add CSS animation for loading spinner
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
})(window, document);
