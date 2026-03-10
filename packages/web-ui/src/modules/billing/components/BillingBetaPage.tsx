import { Bell, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { Separator } from "../../../components/ui/separator";
import { cn } from "../../../lib/utils";

interface BillingBetaPageProps {
  appName: string;
  className?: string;
  footer?: ReactNode;
}

export function BillingBetaPage({ appName, className, footer }: BillingBetaPageProps) {
  const { t } = useTranslation("web-ui");
  return (
    <div className={cn("mx-auto max-w-5xl px-4 py-12 md:py-16", className)}>
      {/* Heading */}
      <div className="flex flex-col items-center text-center gap-4">
        <Badge variant="secondary" className="uppercase tracking-wide">
          {t("billing.beta.badge")}
        </Badge>
        <div className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            {t("billing.title")}
          </h1>
          <p className="text-muted-foreground max-w-2xl">{t("billing.subtitle", { appName })}</p>
        </div>
      </div>

      <Separator className="my-8" />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
              <Sparkles className="h-5 w-5 shrink-0" />
              <CardTitle>{t("billing.card.free.title")}</CardTitle>
            </div>
            <CardDescription>{t("billing.card.free.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight">
                {t("billing.card.free.price")}
              </span>
              <span className="text-muted-foreground">{t("billing.card.free.priceSuffix")}</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />{" "}
                {t("billing.card.free.feature.fullAccess")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />{" "}
                {t("billing.card.free.feature.noCard")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />{" "}
                {t("billing.card.free.feature.riskFree")}
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-500">
              <Clock3 className="h-5 w-5 shrink-0" />
              <CardTitle>{t("billing.card.progress.title")}</CardTitle>
            </div>
            <CardDescription>{t("billing.card.progress.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />{" "}
                {t("billing.card.progress.feature.transparentPlans")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />{" "}
                {t("billing.card.progress.feature.fairValue")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />{" "}
                {t("billing.card.progress.feature.simpleBilling")}
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
              <Bell className="h-5 w-5 shrink-0" />
              <CardTitle>{t("billing.card.notice.title")}</CardTitle>
            </div>
            <CardDescription>{t("billing.card.notice.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-600" />{" "}
                {t("billing.card.notice.feature.timeToDecide")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-600" />{" "}
                {t("billing.card.notice.feature.safeData")}
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-600" />{" "}
                {t("billing.card.notice.feature.autoFreeTier")}
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {footer}
    </div>
  );
}
