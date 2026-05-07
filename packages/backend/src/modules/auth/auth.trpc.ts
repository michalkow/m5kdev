import { z } from "zod";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import {
  accountClaimMagicLinkSchemas,
  invitationSchemas,
  organizationSchemas,
  waitlistSchemas,
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
      .input(invitationSchemas.input.read)
      .output(invitationSchemas.output.read)
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.readInvitation(input, ctx));
      }),

    createInvitationCode: procedure
      .input(waitlistSchemas.input.create)
      .output(waitlistSchemas.output.full)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.createInvitationCode(input, ctx));
      }),

    createAccountClaimCode: adminProcedure
      .input(accountClaimMagicLinkSchemas.input.create)
      .output(waitlistSchemas.output.claim)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.createAccountClaimCode(input, ctx));
      }),

    listAccountClaims: adminProcedure
      .output(waitlistSchemas.output.accountClaim.array())
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.listAccountClaims(undefined, ctx));
      }),

    generateAccountClaimMagicLink: adminProcedure
      .input(accountClaimMagicLinkSchemas.input.generateLink)
      .output(accountClaimMagicLinkSchemas.output.single)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.generateAccountClaimMagicLink(input, ctx));
      }),

    listAccountClaimMagicLinks: adminProcedure
      .input(accountClaimMagicLinkSchemas.input.listLinks)
      .output(accountClaimMagicLinkSchemas.output.single.array())
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.listAccountClaimMagicLinks(input, ctx));
      }),

    getMyAccountClaimStatus: procedure
      .output(waitlistSchemas.output.claim.nullable())
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getMyAccountClaimStatus(undefined, ctx));
      }),

    setMyAccountClaimEmail: procedure
      .input(accountClaimMagicLinkSchemas.input.setEmail)
      .output(z.object({ status: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.setMyAccountClaimEmail(input, ctx));
      }),

    acceptMyAccountClaim: procedure
      .output(z.object({ status: z.boolean() }))
      .mutation(async ({ ctx }) => {
        return handleTRPCResult(await authService.acceptMyAccountClaim(undefined, ctx));
      }),

    listWaitlist: procedure.output(waitlistSchemas.output.full.array()).query(async ({ ctx }) => {
      return handleTRPCResult(await authService.listWaitlist({}, ctx));
    }),

    listAdminWaitlist: adminProcedure
      .output(waitlistSchemas.output.simple.array())
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.listAdminWaitlist(undefined, ctx));
      }),

    listAdminOrganizations: adminProcedure
      .input(organizationSchemas.input.list)
      .output(organizationSchemas.output.list)
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.listAdminOrganizations(input, ctx));
      }),

    updateAdminOrganizationType: adminProcedure
      .input(organizationSchemas.input.updateType)
      .output(organizationSchemas.output.admin)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.updateAdminOrganizationType(input, ctx));
      }),

    addToWaitlist: adminProcedure
      .input(waitlistSchemas.input.add)
      .output(waitlistSchemas.output.single)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.addToWaitlist(input, ctx));
      }),

    inviteToWaitlist: procedure
      .input(waitlistSchemas.input.invite)
      .output(waitlistSchemas.output.full)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.inviteToWaitlist(input, ctx));
      }),

    inviteFromWaitlist: adminProcedure
      .input(waitlistSchemas.input.inviteFrom)
      .output(waitlistSchemas.output.single)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.inviteFromWaitlist(input, ctx));
      }),

    removeFromWaitlist: adminProcedure
      .input(waitlistSchemas.input.remove)
      .output(waitlistSchemas.output.single)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.removeFromWaitlist(input, ctx));
      }),

    joinWaitlist: publicProcedure
      .input(waitlistSchemas.input.join)
      .output(waitlistSchemas.output.single)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.joinWaitlist(input, ctx));
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
      .input(waitlistSchemas.input.validateCode)
      .output(
        z.object({
          status: z.string(),
        })
      )
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.validateWaitlistCode(input.code, ctx));
      }),

    listChildOrganizations: organizationProcedure
      .output(z.array(organizationSchemas.output.child))
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.listChildOrganizations(undefined, ctx));
      }),

    listUserOrganizations: procedure
      .output(z.array(organizationSchemas.output.simple))
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.listUserOrganizations(undefined, ctx));
      }),

    updateChildOrganization: organizationProcedure
      .input(organizationSchemas.input.updateChild)
      .output(organizationSchemas.output.child)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.updateChildOrganization(input, ctx));
      }),

    createOrganization: organizationProcedure
      .input(organizationSchemas.input.create)
      .output(organizationSchemas.output.single)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.createOrganization(input, ctx));
      }),
  });
}
