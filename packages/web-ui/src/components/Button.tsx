import { Button as ButtonPrimitive, type ButtonProps as ButtonPrimitiveProps } from "./ui/button";

export interface ButtonProps extends ButtonPrimitiveProps {
  loading?: boolean;
}

export function Button({ loading, children, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive {...props} disabled={loading || props.disabled}>
      {loading && <i className="ti ti-refresh animate-spin" />}
      {children}
    </ButtonPrimitive>
  );
}
