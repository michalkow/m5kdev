import React from "react";

// Ensure React is loaded for the classic JSX runtime used during email rendering.
void React;

import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  pixelBasedPreset,
  Tailwind,
} from "@react-email/components";
import type { Brand } from "../types";
import { BrandFooter } from "./BrandFooter";
import { BrandHeader } from "./BrandHeader";

interface EmailLayoutProps {
  readonly previewText: string;
  readonly brand: Brand;
  readonly children: React.ReactNode;
}

export function EmailLayout({ previewText, brand, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                brand: "#2250f4",
                offwhite: "#fafbfb",
              },
              spacing: {
                0: "0px",
                20: "20px",
                45: "45px",
              },
            },
          },
        }}
      >
        <Preview>{previewText}</Preview>
        <Body className="bg-offwhite font-sans text-base">
          <BrandHeader brand={brand} />
          <Container className="rounded-lg border border-gray-200 bg-white p-8">
            {children}
          </Container>
          <BrandFooter brand={brand} />
        </Body>
      </Tailwind>
    </Html>
  );
}
