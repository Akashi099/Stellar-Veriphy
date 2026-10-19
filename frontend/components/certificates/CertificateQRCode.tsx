"use client";

/**
 * CertificateQRCode.tsx
 *
 * Cross-browser QR code rendering for certificate sharing and mobile
 * verification workflows (#644).
 *
 * Browser compatibility strategy:
 *  1. Primary: Canvas-based rendering (qrcode library → toCanvas).
 *     Supported by all modern browsers including Chrome, Firefox, Safari,
 *     Edge, and mobile WebKit. Produces crisp, pixel-perfect output at any
 *     device pixel ratio.
 *  2. Fallback: Data-URL PNG (qrcode → toDataURL → <img>).
 *     Used when the Canvas API is unavailable or throws (e.g. canvas
 *     fingerprinting restrictions in some privacy browsers).
 *  3. Final fallback: Structured SVG.
 *     Rendered via the qrcode library's SVG string output. Works even when
 *     canvas and Blob/data-URI APIs are restricted. SVG output scales
 *     infinitely without pixelation.
 *
 * Accessibility:
 *  - The QR code element carries an aria-label and role="img".
 *  - The underlying URL is rendered as a visible <a> beneath the code so
 *    screen-reader and keyboard-only users can still access the link.
 *
 * Print / export:
 *  - Canvas and SVG outputs are sized with the `size` prop (default 220px).
 *  - High-DPI canvas rendering uses window.devicePixelRatio for sharpness.
 */

import QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RenderStrategy = "canvas" | "img" | "svg" | "none";

interface CertificateQRCodeProps {
  /** The URL (or any string) to encode. */
  value: string;
  /** Rendered size in CSS pixels (the canvas / img / svg width + height). Default: 220. */
  size?: number;
  /** Error correction level. "M" is a good balance for certificate URLs. */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  /** Light module colour (default: white). */
  lightColor?: string;
  /** Dark module colour (default: #111827 — near-black for maximum contrast). */
  darkColor?: string;
  /** Accessible label for the QR image. */
  label?: string;
  /** Whether to show the URL as a copyable link beneath the code. */
  showUrl?: boolean;
  /** Extra CSS class for the outer wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// QR generation helpers
// ---------------------------------------------------------------------------

async function tryCanvas(
  canvas: HTMLCanvasElement,
  value: string,
  size: number,
  ecl: "L" | "M" | "Q" | "H",
  light: string,
  dark: string,
): Promise<boolean> {
  try {
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1;
    // Physical pixel size for sharpness on HiDPI screens
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.scale(dpr, dpr);

    await QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: ecl,
      color: { light, dark },
    });
    return true;
  } catch {
    return false;
  }
}

async function tryDataUrl(
  value: string,
  size: number,
  ecl: "L" | "M" | "Q" | "H",
  light: string,
  dark: string,
): Promise<string | null> {
  try {
    return await QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: ecl,
      color: { light, dark },
    });
  } catch {
    return null;
  }
}

async function trySvgString(
  value: string,
  size: number,
  ecl: "L" | "M" | "Q" | "H",
  light: string,
  dark: string,
): Promise<string | null> {
  try {
    return await QRCode.toString(value, {
      type: "svg",
      width: size,
      margin: 2,
      errorCorrectionLevel: ecl,
      color: { light, dark },
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CertificateQRCode({
  value,
  size = 220,
  errorCorrectionLevel = "M",
  lightColor = "#ffffff",
  darkColor = "#111827",
  label,
  showUrl = true,
  className = "",
}: CertificateQRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strategy, setStrategy] = useState<RenderStrategy>("canvas");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [renderError, setRenderError] = useState(false);

  const ariaLabel = label ?? `QR code for ${value}`;

  const render = useCallback(async () => {
    setRenderError(false);

    // Strategy 1: canvas
    if (canvasRef.current) {
      const ok = await tryCanvas(
        canvasRef.current,
        value,
        size,
        errorCorrectionLevel,
        lightColor,
        darkColor,
      );
      if (ok) {
        setStrategy("canvas");
        return;
      }
    }

    // Strategy 2: data URL → <img>
    const url = await tryDataUrl(value, size, errorCorrectionLevel, lightColor, darkColor);
    if (url) {
      setDataUrl(url);
      setStrategy("img");
      return;
    }

    // Strategy 3: inline SVG
    const svg = await trySvgString(value, size, errorCorrectionLevel, lightColor, darkColor);
    if (svg) {
      setSvgHtml(svg);
      setStrategy("svg");
      return;
    }

    // All strategies failed
    setStrategy("none");
    setRenderError(true);
  }, [value, size, errorCorrectionLevel, lightColor, darkColor]);

  useEffect(() => {
    render();
  }, [render]);

  return (
    <div className={`inline-flex flex-col items-center gap-2 ${className}`}>
      {/* Canvas — always mounted so it is available for strategy 1 */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        style={{
          width: size,
          height: size,
          display: strategy === "canvas" ? "block" : "none",
          imageRendering: "pixelated",
          borderRadius: 4,
        }}
      />

      {/* Img fallback */}
      {strategy === "img" && dataUrl && (
        <img
          src={dataUrl}
          alt={ariaLabel}
          width={size}
          height={size}
          style={{ borderRadius: 4, display: "block" }}
          // Prevent blurry upscaling
          style={{ imageRendering: "pixelated", borderRadius: 4 } as React.CSSProperties}
        />
      )}

      {/* SVG fallback */}
      {strategy === "svg" && svgHtml && (
        <div
          role="img"
          aria-label={ariaLabel}
          style={{ width: size, height: size, borderRadius: 4 }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      )}

      {/* Error fallback */}
      {strategy === "none" && renderError && (
        <div
          role="img"
          aria-label={ariaLabel}
          style={{ width: size, height: size }}
          className="flex items-center justify-center rounded border border-gray-200 bg-gray-50 text-center text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
        >
          <span>QR code unavailable in this browser. Use the link below.</span>
        </div>
      )}

      {/* Accessible URL link */}
      {showUrl && (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-[220px] truncate text-center text-xs text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          aria-label={`Verification link: ${value}`}
        >
          {value}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convenience wrapper: certificate share QR
// ---------------------------------------------------------------------------

interface CertificateShareQRProps {
  certificateId: string;
  size?: number;
  showUrl?: boolean;
  className?: string;
}

/**
 * Renders a QR code that links to the certificate's public verification page.
 * Automatically builds the verification URL from the certificate ID.
 */
export function CertificateShareQR({
  certificateId,
  size = 220,
  showUrl = true,
  className,
}: CertificateShareQRProps) {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://veriphy.app";

  const verificationUrl = `${origin}/verify?id=${encodeURIComponent(certificateId)}`;

  return (
    <CertificateQRCode
      value={verificationUrl}
      size={size}
      showUrl={showUrl}
      label={`QR code for certificate #${certificateId} — scan to verify`}
      className={className}
    />
  );
}
