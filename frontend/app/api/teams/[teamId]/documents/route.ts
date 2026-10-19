import type { ApiResponse, SharedVerificationDocument } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

function getStoredDocuments(): SharedVerificationDocument[] {
  if (typeof globalThis !== "undefined" && "documents" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).documents as SharedVerificationDocument[];
  }
  return [];
}

function setStoredDocuments(documents: SharedVerificationDocument[]) {
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as Record<string, SharedVerificationDocument[]>).documents = documents;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { teamId: string } },
): Promise<NextResponse<ApiResponse<SharedVerificationDocument[]>>> {
  try {
    const documents = getStoredDocuments();
    const teamDocuments = documents.filter((d) => d.teamId === params.teamId);

    return NextResponse.json({ success: true, data: teamDocuments });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch documents" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { teamId: string } },
): Promise<NextResponse<ApiResponse<SharedVerificationDocument>>> {
  try {
    const body = await request.json() as {
      title: string;
      contentHash: string;
      manifestHash: string;
      description?: string;
    };
    const documents = getStoredDocuments();

    const newDocument: SharedVerificationDocument = {
      id: `doc_${Date.now()}`,
      teamId: params.teamId,
      title: body.title,
      description: body.description,
      contentHash: body.contentHash,
      manifestHash: body.manifestHash,
      status: "draft",
      createdBy: "user_placeholder",
      createdAt: Date.now(),
      lastModifiedBy: "user_placeholder",
      lastModifiedAt: Date.now(),
      editors: ["user_placeholder"],
    };

    documents.push(newDocument);
    setStoredDocuments(documents);

    return NextResponse.json({ success: true, data: newDocument }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create document" },
      { status: 500 },
    );
  }
}
