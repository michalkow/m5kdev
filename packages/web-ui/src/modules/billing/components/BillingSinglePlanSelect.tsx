import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import {
  findMonthlyStandInPrice,
  formatBillingInterval,
  formatPlanAmount,
} from "@m5kdev/commons/modules/billing/billing.utils";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSubscription } from "@m5kdev/frontend/modules/billing/hooks/useSubscription";
import { Check, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Button, buttonVariants } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { cn } from "../../../lib/utils";

export interface BillingSinglePlanSelectProps {
  plan: StripePlan;
  currency: string;
  features?: string[];
  /** URL for the Terms of Service link. Override for your app's legal page. */
  termsOfServiceUrl?: string;
}

export function BillingSinglePlanSelect({
  plan,
  currency,
  termsOfServiceUrl,
  features = [
    "Unlimited access to all features",
    "Priority support",
    "Early access to new features",
    "Secure data storage",
    "Cancel anytime",
  ],
}: BillingSinglePlanSelectProps) {
  const { t } = useTranslation("web-ui");
  const { serverUrl } = useAppConfig();
  const navigate = useNavigate();
  const { data: subscription } = useSubscription();
  const isTrialing = subscription?.status === "trialing";
  const prices = plan.products[currency]?.prices ?? [];
  const standIn = findMonthlyStandInPrice(plan, currency);
  const [priceId, setPriceId] = useState(standIn?.priceId ?? prices[0]?.priceId ?? "");
  const selected = prices.find((price) => price.priceId === priceId) ?? prices[0];

  const handleLogout = async () => {
    await authClient.signOut();
    navigate("/login");
  };

  const href = selected
    ? `${serverUrl}/stripe/${isTrialing ? "pick" : "checkout"}/${selected.priceId}`
    : undefined;
  const amount =
    selected?.unitAmount != null
      ? formatPlanAmount({ unitAmount: selected.unitAmount, currency })
      : "";

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8">
      <div className="flex flex-col items-center gap-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t("billing.plans.title", "Simple, transparent pricing")}
          </h2>
          <p className="text-muted-foreground text-lg">
            {t("billing.plans.subtitle", "Choose the plan that's right for you")}
          </p>
        </div>

        {prices.length > 1 ? (
          <Tabs
            value={selected?.priceId}
            onValueChange={setPriceId}
            className="w-full max-w-xl"
          >
            <TabsList className="flex w-full flex-wrap">
              {prices.map((price) => (
                <TabsTrigger key={price.priceId} value={price.priceId}>
                  {formatBillingInterval({
                    interval: price.interval,
                    intervalCount: price.intervalCount,
                  })}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}

        <Card className={cn("w-full max-w-md border-2 border-primary")}>
          <CardHeader>
            <CardTitle className="flex justify-between items-start">
              <span className="text-xl font-bold">{plan.name}</span>
            </CardTitle>
            <CardDescription>
              {isTrialing
                ? "Choose an interval before Trial ends"
                : formatBillingInterval({
                    interval: selected?.interval,
                    intervalCount: selected?.intervalCount,
                  })}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold">{amount}</span>
            </div>

            <div className="space-y-3">
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">{feature}</span>
                </div>
              ))}
            </div>
          </CardContent>

          <CardFooter>
            {href ? (
              <a className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full")} href={href}>
                {isTrialing ? "Choose this interval" : "Subscribe"}
              </a>
            ) : null}
          </CardFooter>
        </Card>

        <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
          <a href={termsOfServiceUrl} rel="noopener noreferrer" target="_blank">
            {t("common.termsOfService", "Terms of Service")}
          </a>{" "}
          {t("common.and", "and")}{" "}
          <Link to="/privacy">{t("common.privacyPolicy", "Privacy Policy")}</Link>
        </div>
      </div>

      <div className="fixed bottom-4 left-4">
        <Button variant="ghost" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" />
          {t("sidebar.user.logout", "Log out")}
        </Button>
      </div>
    </div>
  );
}
