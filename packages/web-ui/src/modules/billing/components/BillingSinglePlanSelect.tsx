import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
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
  features?: string[];
  /** URL for the Terms of Service link. Override for your app's legal page. */
  termsOfServiceUrl?: string;
}

export function BillingSinglePlanSelect({
  plan,
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
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annually">("annually");

  const handleLogout = async () => {
    await authClient.signOut();
    navigate("/login");
  };

  const isAnnual = billingInterval === "annually";
  const currentPriceId = isAnnual ? plan.annualDiscountPriceId : plan.priceId;

  // Fallback if no annual price ID exists
  const hasAnnualOption = !!plan.annualDiscountPriceId;

  const priceUnitAmount = plan.priceUnitAmount ?? Number.NaN;
  const annualPriceUnitAmount = plan.annualPriceUnitAmount ?? Number.NaN;

  const priceDisplay = {
    monthly: {
      amount: `$${priceUnitAmount / 100}`,
      label: "/ month",
    },
    annually: {
      amount: `$${annualPriceUnitAmount / 100 / 12}`,
      originalAmount: `$${priceUnitAmount / 100}`,
      label: "/ month, billed annually",
      discountLabel: plan.annualPriceUnitAmount
        ? `Save ${Math.floor(((priceUnitAmount - annualPriceUnitAmount / 12) / priceUnitAmount) * 100).toFixed(0)}%`
        : "",
    },
  };

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

        {hasAnnualOption && (
          <Tabs
            defaultValue="annually"
            value={billingInterval}
            onValueChange={(v) => setBillingInterval(v as "monthly" | "annually")}
            className="w-full max-w-xs"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
              <TabsTrigger value="annually" className="relative">
                Annually
                {priceDisplay.annually.discountLabel && (
                  <span className="absolute -top-3 -right-3 px-1.5 py-0.5 rounded-full bg-green-500 text-[10px] text-white font-medium transform rotate-12">
                    {priceDisplay.annually.discountLabel}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <Card className={cn("w-full max-w-md border-2 border-primary")}>
          <CardHeader>
            <CardTitle className="flex justify-between items-start">
              <span className="text-xl font-bold">{plan.name}</span>
            </CardTitle>
            <CardDescription>
              {isAnnual ? "Perfect for long-term commitment" : "Flexible monthly billing"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold">
                {isAnnual ? priceDisplay.annually.amount : priceDisplay.monthly.amount}
              </span>
              <span className="text-muted-foreground">
                {isAnnual ? priceDisplay.annually.label : priceDisplay.monthly.label}
              </span>
            </div>

            {isAnnual && priceDisplay.annually.originalAmount && (
              <p className="text-sm text-green-500 line-through">
                {" "}
                {priceDisplay.annually.originalAmount} / month
              </p>
            )}

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
            <a
              className={cn(buttonVariants({ variant: "default", size: "lg" }), "w-full")}
              href={`${serverUrl}/stripe/checkout/${currentPriceId}`}
            >
              {isAnnual ? "Subscribe Annually" : "Subscribe Monthly"}
            </a>
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
