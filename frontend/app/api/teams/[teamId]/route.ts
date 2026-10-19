import type { ApiResponse, VerificationTeam } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

function getStoredTeams(): VerificationTeam[] {
  if (typeof globalThis !== "undefined" && "teams" in globalThis) {
    return (globalThis as unknown as Record<string, unknown>).teams as VerificationTeam[];
  }
  return [];
}

function setStoredTeams(teams: VerificationTeam[]) {
  if (typeof globalThis !== "undefined") {
    (globalThis as unknown as Record<string, VerificationTeam[]>).teams = teams;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { teamId: string } },
): Promise<NextResponse<ApiResponse<VerificationTeam>>> {
  try {
    const teams = getStoredTeams();
    const team = teams.find((t) => t.id === params.teamId);

    if (!team) {
      return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: team });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch team" },
      { status: 500 },
    );
  }
}
