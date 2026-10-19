import { ApiError } from "@/lib/api/errors";
import { defineRoute, ok, readJsonBody, requireObject } from "@/lib/api/handler";
import { requireActor } from "@/lib/server/auth";
import { users } from "@/lib/server/store";
import { assertCanAccessUser, assertValid, toPublicProfile } from "@/lib/server/users";
import { STELLAR_ADDRESS_PATTERN, validateProfileUpdate } from "@/lib/validation/user";

type Params = { address: string };

function loadUser(address: string) {
  const user = STELLAR_ADDRESS_PATTERN.test(address) ? users.get(address) : undefined;
  if (!user) throw new ApiError("NOT_FOUND", { message: "User not found." });
  return user;
}

export const GET = defineRoute<Params>("1", async (req, { params }) => {
  const actor = requireActor(req);
  assertCanAccessUser(actor, params.address);
  return ok(toPublicProfile(loadUser(params.address)));
});

export const PATCH = defineRoute<Params>("1", async (req, { params }) => {
  const actor = requireActor(req);
  assertCanAccessUser(actor, params.address);
  loadUser(params.address);

  const changes = assertValid(validateProfileUpdate(requireObject(await readJsonBody(req))));
  const updated = users.update(params.address, changes);
  if (!updated) throw new ApiError("NOT_FOUND", { message: "User not found." });
  return ok(toPublicProfile(updated));
});
