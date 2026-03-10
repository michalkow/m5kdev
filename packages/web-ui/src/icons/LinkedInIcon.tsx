import type { ComponentPropsWithoutRef } from "react";

interface LinkedInIconProps extends ComponentPropsWithoutRef<"svg"> {}

export function LinkedInIcon(props: LinkedInIconProps) {
  return (
    <svg
      aria-hidden="true"
      height="72"
      width="72"
      viewBox="0 0 72 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g fill="none" fillRule="evenodd">
        <path
          d="M8 72h56c4.418 0 8-3.582 8-8V8c0-4.418-3.582-8-8-8H8C3.582 0 0 3.582 0 8v56c0 4.418 3.582 8 8 8Z"
          fill="#007EBB"
        />
        <path
          d="M62 62H51.316V43.802c0-4.99-1.896-7.778-5.845-7.778-4.296 0-6.541 2.901-6.541 7.777V62H28.633V27.333h10.297v4.67S42.026 26.274 49.383 26.274C56.736 26.274 62 30.764 62 40.051zM16.349 22.794c-3.507 0-6.349-2.864-6.349-6.397C10 12.864 12.842 10 16.349 10c3.507 0 6.348 2.864 6.348 6.397 0 3.533-2.84 6.397-6.348 6.397zM11.033 62h10.737V27.333H11.033z"
          fill="#FFF"
        />
      </g>
    </svg>
  );
}


