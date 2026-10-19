import type { ApiResponse, VerificationTeam } from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

const TEAMS_STORAGE_KEY = "teams";

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

export async function GET(): Promise<NextResponse<ApiResponse<VerificationTeam[]>>> {
  try {
    const teams = getStoredTeams();
    return NextResponse.json({ success: true, data: teams });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch teams" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ApiResponse<VerificationTeam>>> {
  try {
    const body = await request.json() as { name: string; description?: string };
    const teams = getStoredTeams();

    const newTeam: VerificationTeam = {
      id: `team_${Date.now()}`,
      name: body.name,
      description: body.description,
      owner: "user_placeholder",
      members: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    teams.push(newTeam);
    setStoredTeams(teams);

    return NextResponse.json({ success: true, data: newTeam }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to create team" },
      { status: 500 },
    );
  }
}
