import { ApiError } from "@/lib/api/errors";
import { defineRoute, ok, readJsonBody, requireObject } from "@/lib/api/handler";
import { users } from "@/lib/server/store";
import { assertValid, toPublicProfile } from "@/lib/server/users";
import { validateOnboarding } from "@/lib/validation/user";

export const POST = defineRoute("1", async (req) => {
  const input = assertValid(validateOnboarding(requireObject(await readJsonBody(req))));

  const now = new Date().toISOString();
  const user = {
    stellarAddress: input.stellarAddress,
    displayName: input.displayName,
    email: input.email,
    bio: input.bio ?? null,
    acceptedTermsAt: now,
    createdAt: now,
    updatedAt: now,
  };
  if (!users.insert(user)) {
    throw new ApiError("CONFLICT", { message: "An account already exists for this Stellar address." });
  }

  return ok(toPublicProfile(user), { status: 201 });
});
