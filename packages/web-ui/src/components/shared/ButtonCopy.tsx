import { CheckCircle, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, type ButtonProps } from "#components/ui/button";
import { cn } from "#utils";

export function ButtonCopy({
  text,
  notificationTimeout = 1000,
  iconOnly = false,
  ...props
}: ButtonProps & { text: string; notificationTimeout?: number; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await window.navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success(t("web-ui:common.copySuccess"));
      setTimeout(() => setIsCopied(false), notificationTimeout);
    } catch (error) {
      toast.error(t("web-ui:common.copyError"));
      console.error(error);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => handleCopy(text)}
      className={cn(isCopied ? "bg-green-200 hover:bg-green-300" : "", iconOnly ? "" : "gap-1")}
      {...props}
    >
      {isCopied ? (
        <>
          <CheckCircle className="h-4 w-4" />
          {!iconOnly && t("web-ui:common.copied")}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {!iconOnly && t("web-ui:common.copy")}
        </>
      )}
    </Button>
  );
}
