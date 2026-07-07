import { z } from "zod";
import { handleTRPCResult, type TRPCMethods } from "../../utils/trpc";
import {
  accountClaimMagicLinkSchemas,
  invitationSchemas,
  organizationSchemas as defaultOrganizationSchemas,
  settingsSchemas,
  waitlistSchemas,
  type OrganizationSchemas,
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
  authService: AuthService,
  organizationSchemas: OrganizationSchemas = defaultOrganizationSchemas
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

    searchAdminUsers: adminProcedure
      .input(organizationSchemas.input.list)
      .output(organizationSchemas.output.adminUsers)
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.searchAdminUsers(input, ctx));
      }),

    listAdminOrganizationMembers: adminProcedure
      .input(organizationSchemas.input.adminMembers)
      .output(organizationSchemas.output.members)
      .query(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.listAdminOrganizationMembers(input, ctx));
      }),

    addAdminOrganizationMember: adminProcedure
      .input(organizationSchemas.input.addAdminMember)
      .output(organizationSchemas.output.member)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.addAdminOrganizationMember(input, ctx));
      }),

    updateAdminOrganizationMemberRole: adminProcedure
      .input(organizationSchemas.input.updateAdminMemberRole)
      .output(organizationSchemas.output.member)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.updateAdminOrganizationMemberRole(input, ctx));
      }),

    removeAdminOrganizationMember: adminProcedure
      .input(organizationSchemas.input.removeAdminMember)
      .output(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.removeAdminOrganizationMember(input, ctx));
      }),

    createAdminOrganization: adminProcedure
      .input(organizationSchemas.input.createAdmin)
      .output(organizationSchemas.output.admin)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.createAdminOrganization(input, ctx));
      }),

    updateAdminOrganization: adminProcedure
      .input(organizationSchemas.input.updateAdmin)
      .output(organizationSchemas.output.admin)
      .mutation(async ({ input, ctx }) => {
        return handleTRPCResult(await authService.updateAdminOrganization(input, ctx));
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

    getLocale: procedure.output(settingsSchemas.output.locale).query(async ({ ctx }) => {
      return handleTRPCResult(await authService.getLocale(undefined, ctx));
    }),

    setLocale: procedure
      .input(z.object({ locale: z.string() }))
      .output(settingsSchemas.output.locale)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setLocale(input, ctx));
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
      .input(settingsSchemas.input.flags)
      .output(settingsSchemas.output.flags)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setOrganizationFlags(input, ctx));
      }),

    getOrganizationOnboarding: organizationProcedure
      .output(settingsSchemas.output.onboarding)
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getOrganizationOnboarding(undefined, ctx));
      }),

    setOrganizationOnboarding: organizationProcedure
      .input(settingsSchemas.input.onboarding)
      .output(settingsSchemas.output.onboarding)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setOrganizationOnboarding(input, ctx));
      }),

    getOrganizationMetadata: organizationProcedure
      .output(settingsSchemas.output.record)
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getOrganizationMetadata(undefined, ctx));
      }),

    setOrganizationMetadata: organizationProcedure
      .input(settingsSchemas.input.patchRecord)
      .output(settingsSchemas.output.record)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setOrganizationMetadata(input, ctx));
      }),

    getMemberOnboarding: organizationProcedure
      .output(settingsSchemas.output.onboarding)
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getMemberOnboarding(undefined, ctx));
      }),

    setMemberOnboarding: organizationProcedure
      .input(settingsSchemas.input.onboarding)
      .output(settingsSchemas.output.onboarding)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setMemberOnboarding(input, ctx));
      }),

    getMemberPreferences: organizationProcedure
      .output(settingsSchemas.output.record)
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getMemberPreferences(undefined, ctx));
      }),

    setMemberPreferences: organizationProcedure
      .input(settingsSchemas.input.patchRecord)
      .output(settingsSchemas.output.record)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setMemberPreferences(input, ctx));
      }),

    getMemberMetadata: organizationProcedure
      .output(settingsSchemas.output.record)
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getMemberMetadata(undefined, ctx));
      }),

    setMemberMetadata: organizationProcedure
      .input(settingsSchemas.input.patchRecord)
      .output(settingsSchemas.output.record)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setMemberMetadata(input, ctx));
      }),

    getMemberFlags: organizationProcedure
      .output(settingsSchemas.output.flags)
      .query(async ({ ctx }) => {
        return handleTRPCResult(await authService.getMemberFlags(undefined, ctx));
      }),

    setMemberFlags: organizationProcedure
      .input(settingsSchemas.input.flags)
      .output(settingsSchemas.output.flags)
      .mutation(async ({ ctx, input }) => {
        return handleTRPCResult(await authService.setMemberFlags(input, ctx));
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
