/** Frames that never point at the failure site: library internals and our own error plumbing. */
const PLUMBING_FRAME = /node_modules|base\.(abstract|procedure)\.|utils[\\/]errors\./;

export function extractOrigin(stack?: string): string | undefined {
  if (!stack) return undefined;
  const frame = stack
    .split("\n")
    .slice(1)
    .find((line) => !PLUMBING_FRAME.test(line));
  return frame?.trim().replace(/^at\s+/, "");
}

/**
 * Keep the stack useful but short for log output: app frames only, capped.
 * Falls back to the untrimmed head when no app frames remain (pure-library stacks),
 * so a stack is never trimmed down to nothing.
 */
export function trimStack(stack?: string, maxFrames = 8): string | undefined {
  if (!stack) return undefined;
  const [header = "", ...frames] = stack.split("\n");
  const appFrames = frames.filter((line) => !PLUMBING_FRAME.test(line));
  const kept = (appFrames.length > 0 ? appFrames : frames).slice(0, maxFrames);
  return [header, ...kept].join("\n");
}
