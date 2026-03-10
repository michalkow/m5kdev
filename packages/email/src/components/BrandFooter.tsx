import React from "react";

// Ensure React is loaded for the classic JSX runtime used during email rendering.
void React;

import { Section, Text } from "@react-email/components";
import type { Brand } from "../types";

export function BrandFooter({ brand }: { brand: Brand }) {
  return (
    <Section className="py-4">
      <Text className="text-center text-sm text-gray-500 m-0">{`${brand.name} - ${brand.tagline}`}</Text>
    </Section>
  );
}
