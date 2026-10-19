import { toValidationResult, rejectUnknownFields, requireObject, stellarAddressField, textField } from "./fields";
import { FieldError, ValidationResult } from "./result";

export const PROFILE_LIMITS = {
  displayNameMinLength: 2,
  displayNameMaxLength: 60,
  bioMaxLength: 500,
  emailMaxLength: 254,
  websiteMaxLength: 200,
};

export interface UserProfileInput {
  walletAddress: string;
  displayName?: string;
  bio?: string;
  email?: string;
  website?: string;
}

const PROFILE_FIELDS = ["walletAddress", "displayName", "bio", "email", "website"] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS_URL = /^https:\/\/[^\s/$.?#].[^\s]*$/i;

// Validates user profile fields. With `partial`, walletAddress may be omitted
// (for updates where the owner comes from the URL or session).
export function validateUserProfile(
  input: unknown,
  options: { partial?: boolean } = {},
): ValidationResult<Partial<UserProfileInput>> {
  const body = requireObject(input);
  if (!body.ok) return body;
  const errors: FieldError[] = [];
  const value = body.value;

  rejectUnknownFields(value, PROFILE_FIELDS, errors);
  const walletAddress = stellarAddressField(value, "walletAddress", { required: !options.partial }, errors);
  const displayName = textField(value, "displayName", {
    minLength: PROFILE_LIMITS.displayNameMinLength,
    maxLength: PROFILE_LIMITS.displayNameMaxLength,
    singleLine: true,
  }, errors);
  const bio = textField(value, "bio", { maxLength: PROFILE_LIMITS.bioMaxLength }, errors);
  const email = textField(value, "email", {
    maxLength: PROFILE_LIMITS.emailMaxLength,
    singleLine: true,
    pattern: { regex: EMAIL, message: "Email address is not valid.", hint: "Use the form name@example.com." },
  }, errors)?.toLowerCase();
  const website = textField(value, "website", {
    maxLength: PROFILE_LIMITS.websiteMaxLength,
    singleLine: true,
    pattern: { regex: HTTPS_URL, message: "Website must be an https:// URL." },
  }, errors);

  return toValidationResult(errors, () => {
    const profile: Partial<UserProfileInput> = {};
    if (walletAddress) profile.walletAddress = walletAddress;
    if (displayName) profile.displayName = displayName;
    if (bio) profile.bio = bio;
    if (email) profile.email = email;
    if (website) profile.website = website;
    return profile;
  });
}
