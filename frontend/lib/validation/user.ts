import { validateFields, type FieldRule, type FieldSchema, type ValidateOptions } from "./fields";

// Field definitions shared by every user-facing endpoint (onboarding, profile)
// and their forms. Change a rule here and both client and server follow.
export const USER_FIELDS = {
  displayName: { type: "string", label: "Display name", minLength: 2, maxLength: 64 },
  email: {
    type: "string",
    label: "Email",
    maxLength: 254,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    formatMessage: "Email must be a valid email address.",
  },
  stellarAddress: {
    type: "string",
    label: "Stellar address",
    pattern: /^G[A-Z2-7]{55}$/,
    formatMessage: "Stellar address must be a valid public key starting with G.",
  },
  bio: { type: "string", label: "Bio", maxLength: 500 },
  acceptedTerms: { type: "boolean", label: "Terms of service", mustBeTrue: true },
} satisfies Record<string, FieldRule>;

type UserField = keyof typeof USER_FIELDS;

// Fields every user record must always have, regardless of endpoint.
export const REQUIRED_USER_FIELDS = ["displayName", "email", "stellarAddress"] as const satisfies readonly UserField[];

function buildSchema(fields: readonly UserField[], required: readonly UserField[]): FieldSchema {
  return Object.fromEntries(
    fields.map((field) => [field, { ...USER_FIELDS[field], required: required.includes(field) }]),
  );
}

export const ONBOARDING_SCHEMA = buildSchema(
  ["displayName", "email", "stellarAddress", "bio", "acceptedTerms"],
  [...REQUIRED_USER_FIELDS, "acceptedTerms"],
);

// The address identifies the account and can't be edited through the profile.
export const PROFILE_UPDATE_SCHEMA = buildSchema(
  ["displayName", "email", "bio"],
  REQUIRED_USER_FIELDS,
);

export interface OnboardingInput {
  displayName: string;
  email: string;
  stellarAddress: string;
  bio?: string;
  acceptedTerms: true;
}

export interface ProfileUpdateInput {
  displayName?: string;
  email?: string;
  bio?: string | null;
}

export function validateOnboarding(input: Record<string, unknown>) {
  return validateFields<OnboardingInput & Record<string, unknown>>(input, ONBOARDING_SCHEMA);
}

export function validateProfileUpdate(input: Record<string, unknown>, options: ValidateOptions = { partial: true }) {
  return validateFields<ProfileUpdateInput & Record<string, unknown>>(input, PROFILE_UPDATE_SCHEMA, options);
}

export const STELLAR_ADDRESS_PATTERN = USER_FIELDS.stellarAddress.pattern;
