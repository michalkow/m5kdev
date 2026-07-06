import { Heading, Text } from "@react-email/components";
import { CtaButton } from "@m5kdev/email/components/CtaButton";
import { EmailLayout } from "@m5kdev/email/components/EmailLayout";
import type { EmailTranslateFn, OrganizationInviteTemplateProps } from "@m5kdev/email/types";

function resolveT(t?: EmailTranslateFn): EmailTranslateFn {
  return t ?? ((key: string) => key);
}

export default function OrganizationInviteEmail({
  previewText,
  inviterName,
  organizationName,
  role,
  url,
  brand,
  t,
  htmlLang,
}: OrganizationInviteTemplateProps) {
  const translate = resolveT(t);

  return (
    <EmailLayout previewText={previewText} brand={brand} htmlLang={htmlLang}>
      <Heading className="mb-4 text-2xl font-bold text-black">
        {translate("organizationInvite.title", { organizationName })}
      </Heading>
      <Text className="mb-6 text-base text-gray-700">
        {translate("organizationInvite.body", { inviterName, organizationName, role })}
      </Text>
      <CtaButton href={url}>{translate("organizationInvite.action")}</CtaButton>
    </EmailLayout>
  );
}
