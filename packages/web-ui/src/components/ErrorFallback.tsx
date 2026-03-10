export function ErrorFallback({
  error,
  componentStack,
}: {
  error: unknown;
  componentStack: string;
}) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  return (
    <div className="flex flex-grow-1 flex-col items-center justify-center h-[100vh]">
      <h1 className="text-3xl font-bold">Something went wrong.</h1>
      <h1 className="text-2xl text-gray-700 font-bold mb-5">Please try again later.</h1>
      <div className="text-lg text-gray-700 mb-5">{errorMessage}</div>
      <div className="text-sm text-gray-500 px-10">{componentStack}</div>
    </div>
  );
}
