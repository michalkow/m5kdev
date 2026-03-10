import { Badge, type BadgeProps } from "@heroui/react";
import { useTranslation } from "react-i18next";

export function LastUsedBadge({
  lastMethod,
  method,
  children,
  ...props
}: BadgeProps & { lastMethod?: string | null; method?: string | null }) {
  const { t } = useTranslation();
  if (lastMethod !== method) return children;
  return (
    <Badge
      {...props}
      content={t("web-ui:auth.login.lastUsed")}
      color="warning"
      className="px-2 !right-[10%]"
    >
      {children}
    </Badge>
  );
}
