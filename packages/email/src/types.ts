export type Brand = {
  name: string;
  logo: string;
  tagline: string;
};

export interface BrandEmailTemplateProps {
  previewText: string;
  brand: Brand;
}

export interface UrlEmailTemplateProps extends BrandEmailTemplateProps {
  url: string;
}

export interface VerificationTemplateProps extends UrlEmailTemplateProps {}
export interface PasswordResetTemplateProps extends UrlEmailTemplateProps {}
export interface AccountDeletionTemplateProps extends UrlEmailTemplateProps {}
export interface OrganizationInviteTemplateProps extends UrlEmailTemplateProps {
  organizationName: string;
  inviterName: string;
  role: string;
}
export interface WaitlistInviteTemplateProps extends UrlEmailTemplateProps {}
export interface WaitlistUserInviteTemplateProps extends UrlEmailTemplateProps {
  inviter: string;
  name?: string;
}

export interface OrganizationInviteTemplateProps extends UrlEmailTemplateProps {}
export interface WaitlistConfirmationTemplateProps extends BrandEmailTemplateProps {
  email: string;
}
export interface SystemWaitlistNotificationTemplateProps extends UrlEmailTemplateProps {
  email: string;
}
