import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import { loadExperience } from "@m5kdev/frontend/modules/app/experience";
import { useEffect, useReducer, useState } from "react";

type BootstrapState =
  | { status: "pending" }
  | { status: "error" }
  | { status: "ready"; experience: PublicExperience };
export function useExperienceBootstrap(url: string, supplied?: PublicExperience) {
  const [attempt, retry] = useReducer((value) => value + 1, 0);
  const [state, setState] = useState<BootstrapState>({ status: "pending" });
  // biome-ignore lint/correctness/useExhaustiveDependencies: The retry counter intentionally reissues the request without changing its URL.
  useEffect(() => {
    if (supplied) return;
    const controller = new AbortController();
    setState({ status: "pending" });
    loadExperience({ url, signal: controller.signal })
      .then((experience) => {
        if (!controller.signal.aborted) setState({ status: "ready", experience });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [url, supplied, attempt]);
  return {
    ...(supplied ? { status: "ready" as const, experience: supplied } : state),
    retry,
  };
}
