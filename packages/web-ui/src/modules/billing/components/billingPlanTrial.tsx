import type { TFunction } from "i18next";
import { Check } from "lucide-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

export function isBillingStartTrialCta({
  trialRequiresPaymentMethod,
  trialDays,
}: {
  trialRequiresPaymentMethod?: boolean;
  trialDays?: number;
}): boolean {
  return Boolean(trialRequiresPaymentMethod && trialDays);
}

export function billingPlanCtaLabel({
  trialRequiresPaymentMethod,
  trialDays,
  t,
}: {
  trialRequiresPaymentMethod?: boolean;
  trialDays?: number;
  t: TFunction<"web-ui">;
}): string {
  return isBillingStartTrialCta({ trialRequiresPaymentMethod, trialDays })
    ? t("billing.plans.startTrial", "Start Trial")
    : t("billing.plans.subscribe", "Subscribe");
}

export function BillingTrialBadge({ days }: { days?: number }): ReactElement | null {
  const { t } = useTranslation("web-ui");
  if (!days) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Check className="h-3 w-3" />
      {t("billing.plans.trialDays", "{{days}}-day Trial", { days })}
    </p>
  );
}
