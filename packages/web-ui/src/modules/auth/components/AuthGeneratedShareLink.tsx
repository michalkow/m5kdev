import { Button, Input, Label, TextField } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** Minting is finished before this control exists; Copy starts in its own user gesture. */
export function AuthGeneratedShareLink({ url }: { url: string }) {
  const { t } = useTranslation();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("web-ui:common.copySuccess"));
    } catch {
      toast.error(t("web-ui:common.copyError"));
    }
  };
  return (
    <div className="grid gap-2">
      <p className="text-sm">{t("web-ui:auth.shareLink.ready")}</p>
      <div className="flex items-end gap-2">
        <TextField className="min-w-0 flex-1" isReadOnly value={url}>
          <Label>{t("web-ui:auth.shareLink.label")}</Label>
          <Input />
        </TextField>
        <Button onPress={() => void copy()}>{t("web-ui:common.copy")}</Button>
      </div>
    </div>
  );
}
