import React from "react";

// Ensure React is loaded for the classic JSX runtime used during email rendering.
void React;

import { Button } from "@react-email/components";

interface CtaButtonProps {
  readonly href: string;
  readonly children: React.ReactNode;
}

export function CtaButton({ href, children }: CtaButtonProps) {
  return (
    <Button
      href={href}
      className="bg-black text-white px-6 py-3 rounded-md font-medium"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </Button>
  );
}
