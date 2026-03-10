import { Spinner, type SpinnerProps } from "@heroui/react";

export function AppLoader(props: SpinnerProps) {
  return (
    <div className="flex h-screen w-full justify-center align-center">
      <Spinner size="lg" {...props} />
    </div>
  );
}
