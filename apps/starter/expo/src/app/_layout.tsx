import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { APP_NAME } from "@starter-app/shared/modules/app/app.constants";
import type { JSX } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LoadingScreen } from "../components/LoadingScreen";
import { appUrl, serverUrl } from "../config";

import "../global.css";

export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <AppConfigProvider
          config={{
            appName: APP_NAME,
            appUrl,
            serverUrl,
          }}
        >
          <AuthProvider loader={<LoadingScreen />}>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </AppConfigProvider>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
