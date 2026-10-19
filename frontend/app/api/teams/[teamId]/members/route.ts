import type { ApiResponse, TeamMember, VerificationTeam } from "@stellarveriphy/shared";
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

export async function POST(
  request: NextRequest,
  { params }: { params: { teamId: string } },
): Promise<NextResponse<ApiResponse<VerificationTeam>>> {
  try {
    const body = await request.json() as { publicKey: string; role: string };
    const teams = getStoredTeams();
    const teamIndex = teams.findIndex((t) => t.id === params.teamId);

    if (teamIndex === -1) {
      return NextResponse.json({ success: false, error: "Team not found" }, { status: 404 });
    }

    const team = teams[teamIndex];
    const newMember: TeamMember = {
      publicKey: body.publicKey,
      role: body.role as TeamMember["role"],
      addedAt: Date.now(),
      permissions: [],
    };

    team.members.push(newMember);
    team.updatedAt = Date.now();
    setStoredTeams(teams);

    return NextResponse.json({ success: true, data: team });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to add team member" },
      { status: 500 },
    );
  }
}
