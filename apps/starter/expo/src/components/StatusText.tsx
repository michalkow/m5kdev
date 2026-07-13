import { Text } from "react-native";

export function StatusText({
  children,
  tone = "default",
  testID,
}: {
  children: string | null;
  tone?: "default" | "error" | "success";
  testID?: string;
}) {
  if (!children) return null;

  const toneClass =
    tone === "error" ? "text-danger" : tone === "success" ? "text-success" : "text-default-600";

  return (
    <Text testID={testID} className={`text-sm ${toneClass}`}>
      {children}
    </Text>
  );
}
