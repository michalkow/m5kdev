/** @jsxRuntime automatic */

import { CtaButton } from "@m5kdev/email/components/CtaButton";
import { EmailLayout } from "@m5kdev/email/components/EmailLayout";
import type { Brand, EmailTranslateFn } from "@m5kdev/email/types";
import { Heading, Text } from "@react-email/components";

function resolveT(t?: EmailTranslateFn): EmailTranslateFn {
  return t ?? ((key: string) => key);
}

export default function TrialEndingEmail({
  previewText,
  url,
  trialEnd,
  brand,
  t,
  htmlLang,
}: {
  previewText: string;
  url: string;
  trialEnd?: string;
  brand: Brand;
  t?: EmailTranslateFn;
  htmlLang?: string;
}) {
  const translate = resolveT(t);

  return (
    <EmailLayout previewText={previewText} brand={brand} htmlLang={htmlLang}>
      <Heading className="mb-4 text-2xl font-bold text-black">
        {translate("trialEnding.title")}
      </Heading>
      <Text className="mb-6 text-base text-gray-700">
        {translate("trialEnding.body", { trialEnd })}
      </Text>
      <CtaButton href={url}>{translate("trialEnding.action")}</CtaButton>
    </EmailLayout>
  );
}
