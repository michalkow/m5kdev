/** @jsxRuntime automatic */
import { Heading, Text } from "@react-email/components";
import { CtaButton } from "@m5kdev/email/components/CtaButton";
import { EmailLayout } from "@m5kdev/email/components/EmailLayout";
import type { Brand, EmailTranslateFn } from "@m5kdev/email/types";

function resolveT(t?: EmailTranslateFn): EmailTranslateFn {
  return t ?? ((key: string) => key);
}

export default function AccountDeletionEmail({
  previewText,
  url,
  brand,
  t,
  htmlLang,
}: {
  previewText: string;
  url: string;
  brand: Brand;
  t?: EmailTranslateFn;
  htmlLang?: string;
}) {
  const translate = resolveT(t);

  return (
    <EmailLayout previewText={previewText} brand={brand} htmlLang={htmlLang}>
      <Heading className="mb-4 text-2xl font-bold text-black">
        {translate("accountDeletion.title")}
      </Heading>
      <Text className="mb-6 text-base text-gray-700">{translate("accountDeletion.body")}</Text>
      <CtaButton href={url}>{translate("accountDeletion.action")}</CtaButton>
    </EmailLayout>
  );
}
