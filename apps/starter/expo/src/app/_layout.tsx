import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import { AppTrpcQueryProvider } from "@m5kdev/frontend/modules/app/components/AppTrpcQueryProvider";
import { AuthProvider } from "@m5kdev/frontend/modules/auth/components/AuthProvider";
import { APP_LOCALE_CONFIG } from "@starter-app/shared/modules/app/app.constants";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import type { JSX } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { LoadingScreen } from "../components/LoadingScreen";
import { appTitle, appUrl, serverUrl } from "../config";

import "../global.css";

export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <AppConfigProvider
          config={{ appName: appTitle, appUrl, serverUrl, locales: APP_LOCALE_CONFIG }}
        >
          <AuthProvider loader={<LoadingScreen />}>
            <AppTrpcQueryProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </AppTrpcQueryProvider>
          </AuthProvider>
        </AppConfigProvider>
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  );
}
