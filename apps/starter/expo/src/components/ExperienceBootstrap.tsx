import type { PublicExperience } from "@m5kdev/commons/modules/app/experience.schema";
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { loadExperience } from "@m5kdev/frontend/modules/app/experience";
import { APP_LOCALE_CONFIG } from "@starter-app/shared/modules/app/app.constants";
import { Button } from "heroui-native";
import { type ReactNode, useEffect, useReducer, useState } from "react";
import { Text, View } from "react-native";
import { serverUrl } from "../config";

type BootstrapState =
  | { status: "pending" }
  | { status: "error" }
  | { status: "ready"; experience: PublicExperience };
export function ExperienceBootstrap({ children }: { children: ReactNode }) {
  const [attempt, retry] = useReducer((value) => value + 1, 0);
  const [state, setState] = useState<BootstrapState>({ status: "pending" });
  // biome-ignore lint/correctness/useExhaustiveDependencies: The retry counter intentionally reissues the request without changing its URL.
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "pending" });
    loadExperience({
      url: `${serverUrl.replace(/\/$/, "")}/app/experience`,
      signal: controller.signal,
    })
      .then((experience) => {
        if (!controller.signal.aborted) setState({ status: "ready", experience });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [attempt]);
  if (state.status === "pending")
    return (
      <View>
        <Text>Loading application...</Text>
      </View>
    );
  if (state.status === "error")
    return (
      <View>
        <Text>Unable to load this application. Check your connection and try again.</Text>
        <Button onPress={retry}>Try again</Button>
      </View>
    );
  return (
    <AppConfigProvider config={{ experience: state.experience, locales: APP_LOCALE_CONFIG }}>
      {children}
    </AppConfigProvider>
  );
}
