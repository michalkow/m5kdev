import { Button, type ButtonProps } from "@heroui/react";
import { CheckCircle, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function CopyButton({
  text,
  notificationTimeout = 1000,
  isIconOnly,
  onCopy,
  ...props
}: ButtonProps & { text: string; notificationTimeout?: number; onCopy?: () => void }) {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await window.navigator.clipboard.writeText(text);
      setIsCopied(true);
      onCopy?.();
      toast.success(t("web-ui:common.copySuccess"));
      setTimeout(() => setIsCopied(false), notificationTimeout);
    } catch (error) {
      toast.error(t("web-ui:common.copyError"));
      console.error(error);
    }
  };

  return (
    <Button isIconOnly={isIconOnly} onPress={() => handleCopy(text)} {...props}>
      {isCopied ? (
        <>
          <CheckCircle className="h-4 w-4" />
          {!isIconOnly && t("web-ui:common.copied")}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {!isIconOnly && t("web-ui:common.copy")}
        </>
      )}
    </Button>
  );
}
