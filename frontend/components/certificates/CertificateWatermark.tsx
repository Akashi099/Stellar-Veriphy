"use client";

/**
 * CertificateWatermark.tsx
 *
 * Watermarking tool for downloaded certificates (Issue #463).
 *
 * Features:
 * - Custom watermark text
 * - Position control (9-point grid)
 * - Opacity control
 * - Live canvas preview before download
 * - "Include in PDF export" — like {@link "../timeline/CertificateHistoryTimelineView"},
 *   no PDF library is bundled yet, so this triggers the browser print dialog
 *   (which can "Save as PDF") on the watermarked canvas.
 */

import { useEffect, useRef, useState } from "react";

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const POSITIONS: WatermarkPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const CANVAS_W = 640;
const CANVAS_H = 452; // ~A4 aspect

export interface CertificateWatermarkProps {
  certificateId?: string;
  className?: string;
}

function watermarkCoords(pos: WatermarkPosition): {
  x: number;
  y: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
} {
  const [v, h] = pos.split("-").length === 2 ? pos.split("-") : ["middle", pos];
  const pad = 24;
  const xMap: Record<string, number> = { left: pad, center: CANVAS_W / 2, right: CANVAS_W - pad };
  const yMap: Record<string, number> = { top: pad, middle: CANVAS_H / 2, bottom: CANVAS_H - pad };
  const alignMap: Record<string, CanvasTextAlign> = {
    left: "left",
    center: "center",
    right: "right",
  };
  const baselineMap: Record<string, CanvasTextBaseline> = {
    top: "top",
    middle: "middle",
    bottom: "bottom",
  };
  const hKey: string = pos === "center" ? "center" : (h ?? pos);
  const vKey: string = pos === "center" ? "middle" : (v ?? "middle");
  return { x: xMap[hKey]!, y: yMap[vKey]!, align: alignMap[hKey]!, baseline: baselineMap[vKey]! };
}

function drawCertificate(ctx: CanvasRenderingContext2D, certificateId: string) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, CANVAS_W - 24, CANVAS_H - 24);

  ctx.fillStyle = "#1f2937";
  ctx.textAlign = "center";
  ctx.font = "bold 28px system-ui, sans-serif";
  ctx.fillText("Certificate of Verification", CANVAS_W / 2, 90);

  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "#4b5563";
  ctx.fillText("Issued by StellarVeriphy", CANVAS_W / 2, 125);

  ctx.font = "14px monospace";
  ctx.fillStyle = "#6b7280";
  ctx.fillText(`Certificate ID: ${certificateId}`, CANVAS_W / 2, CANVAS_H - 40);
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  text: string,
  position: WatermarkPosition,
  opacity: number
) {
  if (!text) return;
  const { x, y, align, baseline } = watermarkCoords(position);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "#111827";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.translate(x, y);
  ctx.rotate(position === "center" ? -0.35 : 0);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function CertificateWatermark({
  certificateId = "SAMPLE-0001",
  className = "",
}: CertificateWatermarkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState("StellarVeriphy");
  const [position, setPosition] = useState<WatermarkPosition>("center");
  const [opacity, setOpacity] = useState(0.3);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCertificate(ctx, certificateId);
    drawWatermark(ctx, text, position, opacity);
  }, [certificateId, text, position, opacity]);

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `certificate-${certificateId}-watermarked.png`;
      a.click();
    }, "image/png");
  };

  const handleExportPdf = () => {
    // No PDF library is bundled in the frontend yet — fall back to the
    // browser print dialog (users can "Save as PDF"), matching the pattern
    // used by CertificateHistoryTimelineView's exportAsPDF().
    window.print();
  };

  return (
    <div className={`flex flex-col gap-6 lg:flex-row ${className}`}>
      {/* Preview */}
      <div className="flex-1 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="w-full" />
      </div>

      {/* Controls */}
      <div className="w-full max-w-xs shrink-0 space-y-4">
        <div>
          <label htmlFor="wm-text" className="block text-sm text-gray-700 dark:text-gray-300">
            Watermark text
          </label>
          <input
            id="wm-text"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={40}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <span className="block text-sm text-gray-700 dark:text-gray-300">Position</span>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {POSITIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPosition(p)}
                aria-pressed={position === p}
                aria-label={`Position: ${p.replace("-", " ")}`}
                className={`aspect-square rounded border text-xs ${
                  position === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-300 text-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                }`}
              >
                ●
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="wm-opacity" className="block text-sm text-gray-700 dark:text-gray-300">
            Opacity ({Math.round(opacity * 100)}%)
          </label>
          <input
            id="wm-opacity"
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownloadPng}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            Download PNG
          </button>
          <button
            onClick={handleExportPdf}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-800"
          >
            Export as PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export default CertificateWatermark;
