import { Input, Label, TextField } from "heroui-native";
import type { TextInputProps } from "react-native";

export function FormTextField({
  label,
  testID,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "none",
  editable = true,
}: {
  label: string;
  testID: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  editable?: boolean;
}) {
  return (
    <TextField isRequired isDisabled={!editable}>
      <Label>{label}</Label>
      <Input
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        editable={editable}
      />
    </TextField>
  );
}
