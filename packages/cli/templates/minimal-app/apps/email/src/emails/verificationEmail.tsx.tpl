import { Text } from "@react-email/components";
import { BaseEmail } from "../components/BaseEmail";

export default function VerificationEmail({
  previewText = "Verify your email",
  url,
}: {
  previewText?: string;
  url: string;
}) {
  return (
    <BaseEmail
      previewText={previewText}
      eyebrow="Welcome"
      title="Verify your email"
      ctaLabel="Verify account"
      ctaUrl={url}
      body={
        <Text style={{ margin: "0" }}>
          Confirm your email address to finish setting up {{APP_NAME}} and access your editorial
          workspace.
        </Text>
      }
    />
  );
}
