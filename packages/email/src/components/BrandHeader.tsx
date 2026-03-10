import React from "react";

// Ensure React is loaded for the classic JSX runtime used during email rendering.
void React;

import { Column, Container, Img, Row, Text } from "@react-email/components";
import type { Brand } from "../types";

export function BrandHeader({ brand }: { brand: Brand }) {
  return (
    <Container className="py-2">
      <Row>
        <Column>
          <Img
            src={brand.logo}
            alt={`${brand.name} Logo`}
            width="80"
            height="80"
            className="mx-auto"
          />
        </Column>
      </Row>
      <Row>
        <Column>
          <Text className="text-2xl font-bold text-black text-center my-1">{brand.name}</Text>
        </Column>
      </Row>
    </Container>
  );
}
