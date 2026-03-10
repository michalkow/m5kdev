import type { ComponentPropsWithoutRef } from "react";

interface MicrosoftIconProps extends ComponentPropsWithoutRef<"svg"> {}

export function MicrosoftIcon(props: MicrosoftIconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 21 21"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path fill="#F35325" d="M0 0h10v10H0z" />
      <path fill="#81BC06" d="M11 0h10v10H11z" />
      <path fill="#05A6F0" d="M0 11h10v10H0z" />
      <path fill="#FFBA08" d="M11 11h10v10H11z" />
    </svg>
  );
}


