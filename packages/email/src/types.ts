export type Brand = {
  name: string;
  logo: string;
  tagline: string;
};

export type EmailTranslateFn = (
  key: string,
  options?: Record<string, unknown>
) => string;

export interface BaseEmailTemplateProps {
  previewText: string;
  t?: EmailTranslateFn;
  htmlLang?: string;
}

export interface BrandEmailTemplateProps extends BaseEmailTemplateProps {
  brand: Brand;
}

export interface UrlEmailTemplateProps extends BrandEmailTemplateProps {
  url: string;
}

export interface VerificationTemplateProps extends UrlEmailTemplateProps {}
export interface PasswordResetTemplateProps extends UrlEmailTemplateProps {}
export interface AccountDeletionTemplateProps extends UrlEmailTemplateProps {}
export interface WaitlistInviteTemplateProps extends UrlEmailTemplateProps {}
export interface OrganizationInviteTemplateProps extends UrlEmailTemplateProps {
  organizationName: string;
  inviterName: string;
  role: string;
}
export interface WaitlistConfirmationTemplateProps extends BrandEmailTemplateProps {
  email: string;
}

export interface WaitlistUserInviteTemplateProps extends UrlEmailTemplateProps {
  inviter: string;
  name?: string;
}

export interface SystemWaitlistNotificationTemplateProps extends UrlEmailTemplateProps {
  email: string;
}
