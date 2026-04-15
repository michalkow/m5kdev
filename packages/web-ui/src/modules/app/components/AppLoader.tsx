import { Spinner, type SpinnerProps } from "@heroui/react";

export function AppLoader(props: SpinnerProps) {
  return (
    <div className="flex h-screen size-full justify-center items-center">
      <Spinner size="xl" color="current" {...props} />
    </div>
  );
}
