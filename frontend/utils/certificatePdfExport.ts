/**
 * certificatePdfExport.ts
 *
 * Generates a professional, print-optimized PDF export of a verified
 * certificate (Certificate of Verification) and triggers a browser download.
 *
 * The PDF includes:
 *  - A branded header / title.
 *  - Certificate identity fields (ID, status, verification level, owner,
 *    creator, created timestamp).
 *  - The three cryptographic proofs (storage ref, manifest hash, attestation
 *    hash) rendered in full as monospace text, since this is intended as an
 *    official record rather than a UI summary.
 *  - A QR code encoding a verification link for the certificate.
 *  - A footer with the generation timestamp and branding.
 *
 * @module utils/certificatePdfExport
 */

import { jsPDF } from "jspdf";
import QRCode from "qrcode";

import type { CertificateVerificationResult } from "@/services/certificateVerificationService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Builds the verification link encoded in the certificate's QR code.
 * Points at the /verify route with the certificate id as a query param.
 */
export function buildVerificationUrl(certificateId: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://veriphy.app";
  return `${origin}/verify?id=${encodeURIComponent(certificateId)}`;
}

/**
 * Generates a QR code as a PNG data URL. Returns null on failure so callers
 * can still produce the PDF without the QR image rather than failing the
 * whole export.
 */
async function generateQrCodeDataUrl(content: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(content, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

const PAGE_MARGIN = 18;
const PAGE_WIDTH = 210; // A4 portrait, mm
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function drawHeader(doc: jsPDF, certificateId: string): number {
  let y = PAGE_MARGIN;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39); // gray-900
  doc.text("Certificate of Verification", PAGE_MARGIN, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text(`Certificate #${certificateId}`, PAGE_MARGIN, y);

  y += 5;
  doc.setDrawColor(229, 231, 235); // gray-200
  doc.setLineWidth(0.5);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);

  return y + 10;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(title.toUpperCase(), PAGE_MARGIN, y);
  return y + 6;
}

function drawField(doc: jsPDF, label: string, value: string, y: number, mono = false): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(label, PAGE_MARGIN, y);

  doc.setFont(mono ? "courier" : "helvetica", "normal");
  doc.setFontSize(mono ? 8.5 : 10);
  doc.setTextColor(17, 24, 39);

  const valueLines = doc.splitTextToSize(value, CONTENT_WIDTH - 45);
  doc.text(valueLines, PAGE_MARGIN + 45, y);

  const lineHeight = mono ? 4 : 5;
  return y + Math.max(6, valueLines.length * lineHeight + 1);
}

/**
 * Builds a print-optimized, single-page certificate PDF and returns the
 * jsPDF document instance (not yet saved).
 */
export async function buildCertificatePdf(result: CertificateVerificationResult): Promise<jsPDF> {
  const { certificate, verificationLevel, statusLabel, owner, displayName, description, isLocked } =
    result;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = drawHeader(doc, certificate.id);

  if (displayName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(displayName, PAGE_MARGIN, y);
    y += 7;
  }

  if (description) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(75, 85, 99);
    const descLines = doc.splitTextToSize(description, CONTENT_WIDTH);
    doc.text(descLines, PAGE_MARGIN, y);
    y += descLines.length * 4.5 + 4;
  }

  // ── Status summary box ──
  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(249, 250, 251); // gray-50
  const boxTop = y;
  doc.roundedRect(PAGE_MARGIN, boxTop, CONTENT_WIDTH, 18, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(17, 24, 39);
  doc.text(`Status: ${statusLabel}`, PAGE_MARGIN + 5, boxTop + 7);
  doc.text(`Verification Level: ${verificationLevel}`, PAGE_MARGIN + 5, boxTop + 13);
  if (isLocked) {
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text("Locked (Immutable)", PAGE_MARGIN + CONTENT_WIDTH - 45, boxTop + 10);
  }
  y = boxTop + 18 + 10;

  // ── Identity section ──
  y = drawSectionTitle(doc, "Identity", y);
  y = drawField(doc, "Certificate ID", certificate.id, y, true);
  y = drawField(doc, "Owner", owner, y, true);
  y = drawField(doc, "Creator", certificate.creator, y, true);
  y = drawField(doc, "Created", formatTimestamp(certificate.timestamp), y);
  y += 4;

  // ── Cryptographic proofs section ──
  y = drawSectionTitle(doc, "Cryptographic Proofs", y);
  y = drawField(doc, "Storage Ref", certificate.storageRef, y, true);
  y = drawField(doc, "Manifest Hash", certificate.manifestHash, y, true);
  y = drawField(doc, "Attestation Hash", certificate.attestationHash, y, true);
  y += 6;

  // ── QR code ──
  const verificationUrl = buildVerificationUrl(certificate.id);
  const qrDataUrl = await generateQrCodeDataUrl(verificationUrl);

  doc.setDrawColor(229, 231, 235);
  doc.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 8;

  y = drawSectionTitle(doc, "Scan to Verify", y);

  const qrSize = 32;
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, "PNG", PAGE_MARGIN, y, qrSize, qrSize);
  } else {
    doc.setDrawColor(209, 213, 219);
    doc.rect(PAGE_MARGIN, y, qrSize, qrSize);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text("QR unavailable", PAGE_MARGIN + 3, y + qrSize / 2);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(75, 85, 99);
  const urlLines = doc.splitTextToSize(verificationUrl, CONTENT_WIDTH - qrSize - 10);
  doc.text(urlLines, PAGE_MARGIN + qrSize + 8, y + 6);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(
    "Scan this code or visit the link above to independently verify this certificate.",
    PAGE_MARGIN + qrSize + 8,
    y + 6 + urlLines.length * 4 + 5
  );

  // ── Footer ──
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - PAGE_MARGIN + 4;
  doc.setDrawColor(229, 231, 235);
  doc.line(PAGE_MARGIN, footerY - 6, PAGE_WIDTH - PAGE_MARGIN, footerY - 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(`Generated by Veriphy on ${new Date().toLocaleString()}`, PAGE_MARGIN, footerY);
  doc.text(
    "This document is a record export and does not itself constitute proof of authenticity.",
    PAGE_MARGIN,
    footerY + 4
  );

  return doc;
}

/**
 * Generates a professional, print-optimized PDF for the given certificate
 * verification result — including an embedded QR code linking to the
 * verification page — and triggers a browser download.
 */
export async function exportCertificateAsPdf(result: CertificateVerificationResult): Promise<void> {
  const doc = await buildCertificatePdf(result);
  doc.save(`certificate-${result.certificate.id}.pdf`);
}
