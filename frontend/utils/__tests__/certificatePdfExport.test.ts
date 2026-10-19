/**
 * Unit tests for utils/certificatePdfExport.ts
 * Covers: buildVerificationUrl, exportCertificateAsPdf (QR generation + jsPDF wiring)
 *
 * jspdf and qrcode are mocked — we only assert that the module calls them
 * with the expected inputs and triggers a download via `.save()`. We do not
 * test actual PDF binary output.
 */

import type { CertificateVerificationResult } from "../../services/certificateVerificationService";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const saveMock = jest.fn();
const addImageMock = jest.fn();

jest.mock("jspdf", () => {
  const jsPDFMock = jest.fn().mockImplementation(() => ({
    setFont: jest.fn(),
    setFontSize: jest.fn(),
    setTextColor: jest.fn(),
    setDrawColor: jest.fn(),
    setFillColor: jest.fn(),
    setLineWidth: jest.fn(),
    text: jest.fn(),
    line: jest.fn(),
    rect: jest.fn(),
    roundedRect: jest.fn(),
    splitTextToSize: jest.fn((value: string) => [value]),
    addImage: addImageMock,
    save: saveMock,
    internal: {
      pageSize: {
        getHeight: () => 297,
      },
    },
  }));
  return { jsPDF: jsPDFMock };
});

const toDataURLMock = jest.fn();

jest.mock("qrcode", () => ({
  __esModule: true,
  default: {
    toDataURL: (...args: unknown[]) => toDataURLMock(...args),
  },
}));

// Import after mocks are registered.
import { buildVerificationUrl, exportCertificateAsPdf } from "../certificatePdfExport";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockResult: CertificateVerificationResult = {
  certificate: {
    id: "cert-123",
    storageRef: "ipfs://storage-ref-hash",
    manifestHash: "manifest-hash-abcdef1234567890",
    attestationHash: "attestation-hash-0987654321fedcba",
    creator: "GABC...CREATOR",
    timestamp: 1_700_000_000,
  },
  isValid: true,
  isRevoked: false,
  isExpired: false,
  verificationLevel: "Premium",
  statusLabel: "Valid",
  owner: "GXYZ...OWNER",
  displayName: "Test Certificate",
  description: "A certificate used for testing.",
  isLocked: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  toDataURLMock.mockResolvedValue("data:image/png;base64,MOCKQR");
});

// ---------------------------------------------------------------------------
// buildVerificationUrl
// ---------------------------------------------------------------------------

describe("buildVerificationUrl", () => {
  it("builds a /verify URL containing the certificate id", () => {
    const url = buildVerificationUrl("cert-123");
    expect(url).toContain("/verify?id=cert-123");
  });

  it("URL-encodes the certificate id", () => {
    const url = buildVerificationUrl("cert with spaces");
    expect(url).toContain(encodeURIComponent("cert with spaces"));
  });
});

// ---------------------------------------------------------------------------
// exportCertificateAsPdf
// ---------------------------------------------------------------------------

describe("exportCertificateAsPdf", () => {
  it("generates a QR code for the certificate's verification link", async () => {
    await exportCertificateAsPdf(mockResult);

    expect(toDataURLMock).toHaveBeenCalledTimes(1);
    const [content] = toDataURLMock.mock.calls[0] as [string];
    expect(content).toBe(buildVerificationUrl("cert-123"));
  });

  it("embeds the generated QR code image into the PDF", async () => {
    await exportCertificateAsPdf(mockResult);

    expect(addImageMock).toHaveBeenCalledWith(
      "data:image/png;base64,MOCKQR",
      "PNG",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("saves the PDF with a filename derived from the certificate id", async () => {
    await exportCertificateAsPdf(mockResult);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith("certificate-cert-123.pdf");
  });

  it("still saves a PDF when QR generation fails", async () => {
    toDataURLMock.mockRejectedValueOnce(new Error("QR generation failed"));

    await expect(exportCertificateAsPdf(mockResult)).resolves.toBeUndefined();

    expect(saveMock).toHaveBeenCalledWith("certificate-cert-123.pdf");
    expect(addImageMock).not.toHaveBeenCalled();
  });
});
