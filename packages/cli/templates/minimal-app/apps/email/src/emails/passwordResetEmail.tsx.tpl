import { Text } from "@react-email/components";
import { BaseEmail } from "../components/BaseEmail";

export default function PasswordResetEmail({
  previewText = "Reset your password",
  url,
}: {
  previewText?: string;
  url: string;
}) {
  return (
    <BaseEmail
      previewText={previewText}
      eyebrow="Access"
      title="Reset your password"
      ctaLabel="Choose a new password"
      ctaUrl={url}
      body={
        <Text style={{ margin: "0" }}>
          Use the secure link below to choose a new password for your {{APP_NAME}} account.
        </Text>
      }
    />
  );
}
