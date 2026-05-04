import { z } from "zod";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import {
  accountClaimMagicLinkOutputSchema,
  accountClaimOutputSchema,
  accountClaimSchema,
  adminOrganizationQueryInputSchema,
  adminOrganizationSchema,
  childOrganizationSchema,
  organizationListSchema,
  organizationSchema,
  organizationTypeSchema,
  readInvitationInputSchema,
  readInvitationOutputSchema,
  simpleOrganizationSchema,
  updateChildOrganizationInputSchema,
  waitlistOutputSchema,
  waitlistSchema,
} from "./auth.dto";
import type { AuthService } from "./auth.service";

export function createAuthTRPC(
  {
    router,
    publicProcedure,
    privateProcedure: procedure,
    adminProcedure,
    organizationProcedure,
  }: TRPCMethods,
  authService: AuthService
) {
  return router({
    getUserWaitlistCount: procedure.output(z.number()).query(async ({ ctx }) => {
      return handleTRPCResult(await authService.getUserWaitlistCount(undefined, ctx));
    }),

    readInvitation: publicProcedure
      .input(readInvitationInputSchema)
      .output(readInvitationOutputSchema)
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.readInvitation(input, ctx));
      }),

    createInvitationCode: procedure
      .input(z.object({ name: z.string().optional() }))
      .output(waitlistSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.createInvitationCode(input, ctx));
      }),

    createAccountClaimCode: adminProcedure
      .input(
        z.object({
          userId: z.string(),
          expiresInHours: z.number().optional(),
        })
      )
      .output(accountClaimSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await authService.createAccountClaimCode(input));
      }),

    listAccountClaims: adminProcedure.output(z.array(accountClaimOutputSchema)).query(async () => {
      return handleTRPCResult(await authService.listAccountClaims());
    }),

    generateAccountClaimMagicLink: adminProcedure
      .input(
        z.object({
          claimId: z.string(),
          email: z.string().email().optional(),
        })
      )
      .output(accountClaimMagicLinkOutputSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await authService.generateAccountClaimMagicLink(input));
      }),

    listAccountClaimMagicLinks: adminProcedure
      .input(
        z.object({
          claimId: z.string(),
        })
      )
      .output(z.array(accountClaimMagicLinkOutputSchema))
      .query(async ({ input }) => {
        return handleTRPCResult(await authService.listAccountClaimMagicLinks(input));
      }),

    getMyAccountClaimStatus: procedure
      .output(accountClaimSchema.nullable())
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getMyAccountClaimStatus(ctx));
      }),

    setMyAccountClaimEmail: procedure
      .input(
        z.object({
          email: z.string().email(),
        })
      )
      .output(z.object({ status: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.setMyAccountClaimEmail(input, ctx));
      }),

    acceptMyAccountClaim: procedure
      .output(z.object({ status: z.boolean() }))
      .mutation(async ({ ctx }) => {
        return handleTRPCResult(await authService.acceptMyAccountClaim(ctx));
      }),

    listWaitlist: procedure.output(z.array(waitlistSchema)).query(async ({ ctx }) => {
      return handleTRPCResult(await authService.listWaitlist(ctx));
    }),

    listAdminWaitlist: adminProcedure
      .output(z.array(waitlistOutputSchema))
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.listAdminWaitlist(undefined, ctx));
      }),

    listAdminOrganizations: adminProcedure
      .input(adminOrganizationQueryInputSchema)
      .output(organizationListSchema)
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.listAdminOrganizations(input, ctx));
      }),

    updateAdminOrganizationType: adminProcedure
      .input(
        z.object({
          organizationId: z.string(),
          type: organizationTypeSchema,
        })
      )
      .output(adminOrganizationSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.updateAdminOrganizationType(input, ctx));
      }),

    addToWaitlist: adminProcedure
      .input(
        z.object({
          email: z.string(),
        })
      )
      .output(waitlistOutputSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await authService.addToWaitlist(input));
      }),

    inviteToWaitlist: procedure
      .input(
        z.object({
          email: z.string(),
          name: z.string().optional(),
        })
      )
      .output(waitlistSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.inviteToWaitlist(input, ctx));
      }),

    inviteFromWaitlist: adminProcedure
      .input(
        z.object({
          id: z.string(),
        })
      )
      .output(waitlistOutputSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await authService.inviteFromWaitlist(input));
      }),

    removeFromWaitlist: adminProcedure
      .input(
        z.object({
          id: z.string(),
        })
      )
      .output(waitlistOutputSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await authService.removeFromWaitlist(input));
      }),

    joinWaitlist: publicProcedure
      .input(
        z.object({
          email: z.string(),
        })
      )
      .output(waitlistOutputSchema)
      .mutation(async ({ input }) => {
        return handleTRPCResult(await authService.joinWaitlist(input));
      }),

    getOnboarding: procedure.output(z.number()).query(async ({ ctx }) => {
      return handleTRPCResult(await authService.getOnboarding(undefined, ctx));
    }),

    setOnboarding: procedure
      .input(z.number())
      .output(z.number())
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setOnboarding(input, ctx));
      }),

    getPreferences: procedure.output(z.record(z.string(), z.unknown())).query(async ({ ctx }) => {
      return handleTRPCResult(await authService.getPreferences(undefined, ctx));
    }),

    setPreferences: procedure
      .input(z.record(z.string(), z.unknown()))
      .output(z.record(z.string(), z.unknown()))
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setPreferences(input, ctx));
      }),

    getOrganizationPreferences: organizationProcedure
      .output(z.record(z.string(), z.unknown()))
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getOrganizationPreferences(undefined, ctx));
      }),

    setOrganizationPreferences: organizationProcedure
      .input(z.record(z.string(), z.unknown()))
      .output(z.record(z.string(), z.unknown()))
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setOrganizationPreferences(input, ctx));
      }),

    getMetadata: procedure.output(z.record(z.string(), z.unknown())).query(async ({ ctx }) => {
      return handleTRPCResult(await authService.getMetadata(undefined, ctx));
    }),

    setMetadata: procedure
      .input(z.record(z.string(), z.unknown()))
      .output(z.record(z.string(), z.unknown()))
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setMetadata(input, ctx));
      }),

    getFlags: procedure.output(z.array(z.string())).query(async ({ ctx }) => {
      return handleTRPCResult(await authService.getFlags(undefined, ctx));
    }),

    getOrganizationFlags: organizationProcedure
      .output(z.array(z.string()))
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getOrganizationFlags(undefined, ctx));
      }),

    setFlags: procedure
      .input(z.array(z.string()))
      .output(z.array(z.string()))
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setFlags(input, ctx));
      }),

    setOrganizationFlags: organizationProcedure
      .input(z.array(z.string()))
      .output(z.array(z.string()))
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setOrganizationFlags(input, ctx));
      }),

    validateWaitlistCode: publicProcedure
      .input(
        z.object({
          code: z.string(),
        })
      )
      .output(
        z.object({
          status: z.string(),
        })
      )
      .query(async ({ input }) => {
        return handleTRPCResult(await authService.validateWaitlistCode(input.code));
      }),

    listChildOrganizations: organizationProcedure
      .output(z.array(childOrganizationSchema))
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.listChildOrganizations(undefined, ctx));
      }),

    listUserOrganizations: procedure
      .output(z.array(simpleOrganizationSchema))
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.listUserOrganizations(undefined, ctx));
      }),

    updateChildOrganization: organizationProcedure
      .input(updateChildOrganizationInputSchema)
      .output(childOrganizationSchema)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.updateChildOrganization(input, ctx));
      }),

    createOrganization: organizationProcedure
      .input(z.object({ name: z.string() }))
      .output(organizationSchema)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.createOrganization(input, ctx));
      }),
  });
}
