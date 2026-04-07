import fs from "node:fs";
import type { NotificationProvider } from "@m5kdev/commons/modules/notification/notification.constants";
import apn from "@parse/node-apn";
import admin from "firebase-admin";
import webpush from "web-push";

export function readVapidPublicKey(): string | undefined {
  const k = process.env.VAPID_PUBLIC_KEY;
  return k && k.length > 0 ? k : undefined;
}

export function ensureWebPushConfigured(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:noreply@localhost";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set for web push");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendWebPushNotification(
  subscription: webpush.PushSubscription,
  payloadJson: string
): Promise<void> {
  ensureWebPushConfigured();
  await webpush.sendNotification(subscription, payloadJson, { urgency: "normal" });
}

let apnProvider: apn.Provider | null = null;

function getApnProvider(): apn.Provider {
  if (apnProvider) return apnProvider;
  const keyPath = process.env.APNS_KEY_PATH;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyPath || !keyId || !teamId) {
    throw new Error("APNS_KEY_PATH, APNS_KEY_ID, and APNS_TEAM_ID must be set for APNs");
  }
  let keyMaterial: Buffer;
  try {
    keyMaterial = fs.readFileSync(keyPath);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Failed to read APNs auth key file at ${keyPath}: ${message}`, { cause });
  }
  apnProvider = new apn.Provider({
    production: process.env.APNS_PRODUCTION === "true",
    token: {
      key: keyMaterial,
      keyId,
      teamId,
    },
  });
  return apnProvider;
}

export async function sendApnNotification(
  deviceToken: string,
  alert: { title: string; body: string },
  payload: Record<string, unknown>
): Promise<void> {
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!bundleId) {
    throw new Error("APNS_BUNDLE_ID must be set for APNs");
  }
  const note = new apn.Notification();
  note.topic = bundleId;
  note.expiry = Math.floor(Date.now() / 1000) + 3600;
  note.alert = { title: alert.title, body: alert.body };
  note.payload = payload;

  const provider = getApnProvider();
  const result = await provider.send(note, deviceToken);
  if (result.failed.length > 0) {
    const first = result.failed[0];
    const reason = first.response?.reason ?? first.error?.message ?? "APNs send failed";
    throw new Error(reason);
  }
}

let firebaseInitPromise: Promise<void> | null = null;

async function ensureFirebaseInitialized(): Promise<void> {
  if (admin.apps.length > 0) {
    return;
  }
  if (!firebaseInitPromise) {
    firebaseInitPromise = (async () => {
      const credPath =
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!credPath?.length) {
        throw new Error(
          "FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS must be set for FCM"
        );
      }
      let serviceAccount: admin.ServiceAccount;
      try {
        const raw = fs.readFileSync(credPath, "utf8");
        serviceAccount = JSON.parse(raw) as admin.ServiceAccount;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          `Failed to load Firebase service account JSON from ${credPath}: ${message}`,
          { cause }
        );
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    })();
  }
  try {
    await firebaseInitPromise;
  } catch (e) {
    firebaseInitPromise = null;
    throw e;
  }
}

async function getFirebaseMessaging(): Promise<admin.messaging.Messaging> {
  await ensureFirebaseInitialized();
  return admin.messaging();
}

export async function sendFcmNotification(
  token: string,
  notification: { title: string; body: string },
  data: Record<string, string>
): Promise<void> {
  const messaging = await getFirebaseMessaging();
  await messaging.send({
    token,
    notification,
    data,
  });
}

export function webPushErrorShouldDisableDevice(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = (err as { statusCode?: number }).statusCode;
    return code === 404 || code === 410;
  }
  return false;
}

export function providerForPermanentTokenFailure(
  provider: NotificationProvider,
  err: unknown
): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (provider === "web") {
    return webPushErrorShouldDisableDevice(err);
  }
  if (provider === "fcm") {
    return (
      message.includes("registration-token-not-registered") ||
      message.includes("Requested entity was not found") ||
      message.includes("InvalidRegistration")
    );
  }
  if (provider === "apn") {
    return (
      message.includes("BadDeviceToken") ||
      message.includes("Unregistered") ||
      message.includes("DeviceTokenNotForTopic")
    );
  }
  return false;
}
