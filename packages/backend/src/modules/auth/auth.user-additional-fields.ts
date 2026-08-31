export interface AuthUserAdditionalField {
  readonly type: "string" | "number";
  readonly required: false;
  readonly defaultValue: null;
  readonly returned?: false;
  readonly input?: boolean;
}

export type AuthUserAdditionalFields = Record<string, AuthUserAdditionalField>;

export function createAuthUserAdditionalFields(): AuthUserAdditionalFields {
  return {
    onboarding: {
      type: "number",
      required: false,
      defaultValue: null,
    },
    // returned: false keeps these out of session responses and the
    // session cookie cache (4KB limit); read them via auth.service procedures
    preferences: {
      type: "string",
      required: false,
      defaultValue: null,
      returned: false,
    },
    metadata: {
      type: "string",
      required: false,
      defaultValue: null,
      returned: false,
    },
    flags: {
      type: "string",
      required: false,
      defaultValue: null,
      returned: false,
    },
    stripeCustomerId: {
      type: "string",
      required: false,
      defaultValue: null,
      input: false,
    },
    locale: {
      type: "string",
      required: false,
      defaultValue: null,
      input: true,
    },
  };
}
