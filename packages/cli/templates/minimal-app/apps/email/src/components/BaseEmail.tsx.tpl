import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

interface BaseEmailProps {
  previewText: string;
  title: string;
  eyebrow: string;
  body: ReactNode;
  ctaLabel?: string;
  ctaUrl?: string;
}

export function BaseEmail({ previewText, title, eyebrow, body, ctaLabel, ctaUrl }: BaseEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{
          backgroundColor: "#f3efe6",
          fontFamily: "'Manrope', 'Helvetica Neue', Arial, sans-serif",
          margin: "0",
          padding: "32px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: "#fffaf1",
            border: "1px solid #d6c7ab",
            borderRadius: "24px",
            margin: "0 auto",
            maxWidth: "620px",
            padding: "40px",
          }}
        >
          <Text
            style={{
              color: "#8b5e34",
              fontSize: "12px",
              fontWeight: "700",
              letterSpacing: "0.18em",
              margin: "0 0 16px",
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </Text>
          <Heading
            style={{
              color: "#171314",
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "34px",
              lineHeight: "1.1",
              margin: "0 0 20px",
            }}
          >
            {title}
          </Heading>
          <Section
            style={{
              color: "#463630",
              fontSize: "16px",
              lineHeight: "1.7",
            }}
          >
            {body}
          </Section>
          {ctaLabel && ctaUrl ? (
            <Section style={{ marginTop: "28px" }}>
              <Button
                href={ctaUrl}
                style={{
                  backgroundColor: "#1f4f46",
                  borderRadius: "999px",
                  color: "#fdf9f1",
                  fontSize: "15px",
                  fontWeight: "700",
                  padding: "14px 24px",
                  textDecoration: "none",
                }}
              >
                {ctaLabel}
              </Button>
            </Section>
          ) : null}
          <Hr
            style={{
              borderColor: "#e5dccd",
              margin: "28px 0",
            }}
          />
          <Text
            style={{
              color: "#7f6b5d",
              fontSize: "13px",
              lineHeight: "1.6",
              margin: "0",
            }}
          >
            Sent by {{APP_NAME}}.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
