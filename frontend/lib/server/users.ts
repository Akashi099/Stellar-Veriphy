import { ApiError } from "@/lib/api/errors";
import type { ValidationResult } from "@/lib/validation/fields";
import type { Actor } from "./auth";
import type { UserRecord } from "./store";

// Turns a shared-validation result into the standard VALIDATION_FAILED error.
export function assertValid<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw ApiError.validation(result.errors);
  return result.value;
}

export function assertCanAccessUser(actor: Actor, address: string) {
  if (actor.role !== "admin" && actor.subject !== address) throw new ApiError("FORBIDDEN");
}

export function toPublicProfile(user: UserRecord) {
  return {
    stellarAddress: user.stellarAddress,
    displayName: user.displayName,
    email: user.email,
    bio: user.bio,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
