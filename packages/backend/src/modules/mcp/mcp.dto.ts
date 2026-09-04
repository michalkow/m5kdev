import { z } from "zod";

const consentOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  allowlisted: z.boolean(),
});

export const mcpConsentSchemas = {
  output: {
    organization: consentOrganizationSchema,
    organizations: consentOrganizationSchema.array(),
  },
  input: {
    listConsentOrganizations: z.object({
      oauthClientId: z.string().min(1),
    }),
    replaceConsentAllowlist: z.object({
      oauthClientId: z.string().min(1),
      organizationIds: z.array(z.string().min(1)),
    }),
  },
};
