import { Text } from "@react-email/components";
import { BaseEmail } from "../components/BaseEmail";

export default function OrganizationInviteEmail({
  previewText = "You have been invited to join an organization",
  inviterName,
  organizationName,
  role,
  url,
}: {
  previewText?: string;
  inviterName: string;
  organizationName: string;
  role: string;
  url: string;
}) {
  return (
    <BaseEmail
      previewText={previewText}
      eyebrow="Collaboration"
      title={`Join ${organizationName}`}
      ctaLabel="Accept invitation"
      ctaUrl={url}
      body={
        <Text style={{ margin: "0" }}>
          {inviterName} invited you to join {organizationName} as {role}.
        </Text>
      }
    />
  );
}
