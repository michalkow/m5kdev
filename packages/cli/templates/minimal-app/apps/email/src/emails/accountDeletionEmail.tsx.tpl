import { Text } from "@react-email/components";
import { BaseEmail } from "../components/BaseEmail";

export default function AccountDeletionEmail({
  previewText = "Confirm your account deletion",
  url,
}: {
  previewText?: string;
  url: string;
}) {
  return (
    <BaseEmail
      previewText={previewText}
      eyebrow="Account Safety"
      title="Confirm account deletion"
      ctaLabel="Review deletion"
      ctaUrl={url}
      body={
        <Text style={{ margin: "0" }}>
          We received a request to delete your {{APP_NAME}} account. If that was you, use the link
          below to confirm the action.
        </Text>
      }
    />
  );
}
