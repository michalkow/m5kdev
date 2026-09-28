import { Button, Chip, Input, Label, ListBox, Modal, Select, TextField } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { type BillingCoupon, MAX_TRIAL_DAYS } from "@m5kdev/commons/modules/billing/billing.schema";
import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import {
  catalogCurrencyKeys,
  formatPlanAmount,
} from "@m5kdev/commons/modules/billing/billing.utils";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { type ReactElement, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { NuqsTable, type NuqsTableColumn } from "../../table/components/NuqsTable";
import useNuqsTable from "../../table/hooks/useNuqsTable";

type BillingAdminRow =
  inferRouterOutputs<BackendTRPCRouter>["billing"]["listAdminOrganizationBilling"]["rows"][number];
type ListBillingAdminInput =
  inferRouterInputs<BackendTRPCRouter>["billing"]["listAdminOrganizationBilling"];
type ListBillingAdminOutput =
  inferRouterOutputs<BackendTRPCRouter>["billing"]["listAdminOrganizationBilling"];

type BillingAdminDialog =
  | { kind: "currency"; row: BillingAdminRow }
  | { kind: "subscription"; row: BillingAdminRow }
  | { kind: "coupon"; row: BillingAdminRow };

interface PriceOption {
  readonly priceId: string;
  readonly label: string;
}

interface AdminMutationOptions {
  onSuccess: () => Promise<void>;
  onError: (error: unknown) => void;
}

type SubscriptionStart = "none" | "trial" | "coupon";

const SUBSCRIPTION_STARTS: readonly SubscriptionStart[] = ["none", "trial", "coupon"];

function isSubscriptionStart(value: unknown): value is SubscriptionStart {
  return SUBSCRIPTION_STARTS.some((start) => start === value);
}

function pricesForCurrency({
  plans,
  currency,
}: {
  plans: readonly StripePlan[];
  currency: string;
}): PriceOption[] {
  const rows: PriceOption[] = [];
  for (const plan of plans) {
    const product = plan.products[currency];
    if (!product) continue;
    for (const price of product.prices) {
      rows.push({
        priceId: price.priceId,
        label: `${plan.name} · ${price.intervalCount > 1 ? `${price.intervalCount} ` : ""}${price.interval}`,
      });
    }
  }
  return rows;
}

function couponLabel({
  coupon,
  t,
}: {
  coupon: BillingCoupon;
  t: ReturnType<typeof useTranslation>["t"];
}): string {
  const discount =
    coupon.percentOff != null
      ? `${coupon.percentOff}%`
      : coupon.amountOff != null && coupon.currency
        ? formatPlanAmount({ unitAmount: coupon.amountOff, currency: coupon.currency })
        : null;
  const duration =
    coupon.duration === "repeating"
      ? t("web-ui:billing.admin.couponMonths", { count: coupon.durationInMonths ?? 0 })
      : coupon.duration
        ? t(`web-ui:billing.admin.coupon.${coupon.duration}`)
        : null;
  return [coupon.name ?? coupon.id, discount, duration].filter(Boolean).join(" · ");
}

export function BillingAdminPage({ plans }: { plans: readonly StripePlan[] }): ReactElement {
  const { t } = useTranslation();
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<BillingAdminDialog | null>(null);
  const [currency, setCurrency] = useState("");
  const [priceId, setPriceId] = useState("");
  const [couponId, setCouponId] = useState("");
  const [start, setStart] = useState<SubscriptionStart>("none");
  const [trialDays, setTrialDays] = useState("");

  const currencies = useMemo(() => catalogCurrencyKeys(plans), [plans]);

  const { params: tableParams, query } = useNuqsTable<
    ListBillingAdminInput,
    ListBillingAdminOutput
  >({
    getQueryOptions: (input) => trpc.billing.listAdminOrganizationBilling.queryOptions(input),
    prefix: "ba",
  });

  const couponsQuery = useQuery({
    ...trpc.billing.listAdminCoupons.queryOptions(),
    enabled: dialog?.kind === "subscription" || dialog?.kind === "coupon",
  });
  const coupons = couponsQuery.data ?? [];

  const mutationOptions = (successKey: string): AdminMutationOptions => ({
    onSuccess: async () => {
      toast.success(t(successKey));
      setDialog(null);
      await queryClient.invalidateQueries({
        queryKey: trpc.billing.listAdminOrganizationBilling.queryKey(),
      });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const setCurrencyMutation = useMutation(
    trpc.billing.setAdminOrganizationCurrency.mutationOptions(
      mutationOptions("web-ui:billing.admin.currencySuccess")
    )
  );
  const createCustomer = useMutation(
    trpc.billing.createAdminCustomer.mutationOptions(
      mutationOptions("web-ui:billing.admin.customerSuccess")
    )
  );
  const createSubscription = useMutation(
    trpc.billing.createAdminSubscription.mutationOptions(
      mutationOptions("web-ui:billing.admin.subscriptionSuccess")
    )
  );
  const applyCoupon = useMutation(
    trpc.billing.applyAdminCoupon.mutationOptions(
      mutationOptions("web-ui:billing.admin.couponSuccess")
    )
  );
  const removeCoupon = useMutation(
    trpc.billing.removeAdminCoupon.mutationOptions(
      mutationOptions("web-ui:billing.admin.removeCouponSuccess")
    )
  );
  const cancelSubscription = useMutation(
    trpc.billing.cancelAdminSubscription.mutationOptions(
      mutationOptions("web-ui:billing.admin.cancelSuccess")
    )
  );

  const openDialog = (next: BillingAdminDialog): void => {
    setCurrency(currencies[0] ?? "");
    const firstPrice = next.row.currency
      ? pricesForCurrency({ plans, currency: next.row.currency })[0]
      : undefined;
    setPriceId(firstPrice?.priceId ?? "");
    setCouponId("");
    setStart("none");
    setTrialDays(next.row.defaultTrialDays ? String(next.row.defaultTrialDays) : "");
    setDialog(next);
  };

  const columns: NuqsTableColumn<BillingAdminRow>[] = [
    {
      id: "organizationName",
      accessorKey: "organizationName",
      header: t("web-ui:billing.admin.organization"),
    },
    {
      id: "stripeCustomerId",
      accessorFn: (row) => row.stripeCustomerId ?? "—",
      header: t("web-ui:billing.admin.customer"),
    },
    {
      id: "currency",
      accessorFn: (row) => row.currency?.toUpperCase() ?? "—",
      header: t("web-ui:billing.admin.currency"),
    },
    {
      id: "status",
      accessorFn: (row) => row.subscription?.status ?? "—",
      header: t("web-ui:billing.admin.status"),
    },
    {
      id: "plan",
      accessorFn: (row) => row.subscription?.plan ?? "—",
      header: t("web-ui:billing.admin.plan"),
    },
    {
      id: "priceId",
      accessorFn: (row) => row.subscription?.priceId ?? "—",
      header: t("web-ui:billing.admin.price"),
    },
    {
      id: "trialEnd",
      accessorFn: (row) =>
        row.subscription?.trialEnd ? new Date(row.subscription.trialEnd).toLocaleDateString() : "—",
      header: t("web-ui:billing.admin.trialEnd"),
    },
    {
      id: "coupon",
      accessorFn: (row) => (row.coupon ? couponLabel({ coupon: row.coupon, t }) : "—"),
      header: t("web-ui:billing.admin.coupon"),
    },
    {
      id: "actions",
      header: t("web-ui:billing.admin.actions"),
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="flex flex-wrap gap-2">
            {item.currency ? null : (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => openDialog({ kind: "currency", row: item })}
              >
                {t("web-ui:billing.admin.setCurrency")}
              </Button>
            )}
            {item.stripeCustomerId ? null : (
              <Button
                size="sm"
                variant="secondary"
                isPending={createCustomer.isPending}
                onPress={() => createCustomer.mutate({ organizationId: item.organizationId })}
              >
                {t("web-ui:billing.admin.createCustomer")}
              </Button>
            )}
            {!item.openSubscription && item.currency ? (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => openDialog({ kind: "subscription", row: item })}
              >
                {t("web-ui:billing.admin.createSubscription")}
              </Button>
            ) : null}
            {item.openSubscription ? (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => openDialog({ kind: "coupon", row: item })}
                >
                  {t("web-ui:billing.admin.applyCoupon")}
                </Button>
                {item.coupon ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => removeCoupon.mutate({ organizationId: item.organizationId })}
                  >
                    {t("web-ui:billing.admin.removeCoupon")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    cancelSubscription.mutate({
                      organizationId: item.organizationId,
                      when: "period_end",
                    })
                  }
                >
                  {t("web-ui:billing.admin.cancelPeriodEnd")}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onPress={() =>
                    cancelSubscription.mutate({
                      organizationId: item.organizationId,
                      when: "immediate",
                    })
                  }
                >
                  {t("web-ui:billing.admin.cancelNow")}
                </Button>
              </>
            ) : null}
          </div>
        );
      },
    },
  ];

  const dialogPrices = dialog?.row.currency
    ? pricesForCurrency({ plans, currency: dialog.row.currency })
    : [];
  const parsedTrialDays = Number.parseInt(trialDays, 10);
  const trialDaysValid = parsedTrialDays >= 1 && parsedTrialDays <= MAX_TRIAL_DAYS;
  const showCouponSelect =
    dialog?.kind === "coupon" || (dialog?.kind === "subscription" && start === "coupon");

  const handleConfirm = (): void => {
    if (!dialog) return;
    const organizationId = dialog.row.organizationId;
    if (dialog.kind === "currency") {
      if (currency) setCurrencyMutation.mutate({ organizationId, currency });
      return;
    }
    if (dialog.kind === "subscription") {
      if (!priceId) return;
      createSubscription.mutate({
        organizationId,
        priceId,
        ...(start === "trial" ? { trialDays: parsedTrialDays } : {}),
        ...(start === "coupon" ? { couponId } : {}),
      });
      return;
    }
    if (couponId) applyCoupon.mutate({ organizationId, couponId });
  };

  const isConfirmDisabled =
    dialog?.kind === "currency"
      ? !currency || setCurrencyMutation.isPending
      : dialog?.kind === "subscription"
        ? !priceId ||
          createSubscription.isPending ||
          (start === "trial" && !trialDaysValid) ||
          (start === "coupon" && !couponId)
        : !couponId || applyCoupon.isPending;

  const couponOptions = coupons.map((coupon) => ({
    id: coupon.id,
    label: couponLabel({ coupon, t }),
  }));

  const environment = query.data?.environment;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{t("web-ui:billing.admin.title")}</h1>
        {environment ? (
          <Chip color={environment === "production" ? "success" : "warning"} variant="soft">
            {t(`web-ui:billing.admin.environment.${environment}`)}
          </Chip>
        ) : null}
      </div>
      <NuqsTable<BillingAdminRow>
        data={query.data?.rows ?? []}
        total={query.data?.total ?? 0}
        columns={columns}
        tableProps={tableParams}
        showGlobalSearch
        hideFilters
      />

      <Modal isOpen={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(null)}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>
                  {dialog?.kind === "currency"
                    ? t("web-ui:billing.admin.setCurrency")
                    : dialog?.kind === "subscription"
                      ? t("web-ui:billing.admin.createSubscription")
                      : t("web-ui:billing.admin.applyCoupon")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-4">
                {dialog?.kind === "currency" ? (
                  <Select
                    aria-label={t("web-ui:billing.admin.currency")}
                    selectedKey={currency || null}
                    onSelectionChange={(key) => {
                      if (key !== null) setCurrency(String(key));
                    }}
                    variant="secondary"
                    className="w-full"
                  >
                    <Label>{t("web-ui:billing.admin.currency")}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {currencies.map((key) => (
                          <ListBox.Item key={key} id={key} textValue={key.toUpperCase()}>
                            {key.toUpperCase()}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                ) : null}
                {dialog?.kind === "subscription" ? (
                  <Select
                    aria-label={t("web-ui:billing.admin.price")}
                    selectedKey={priceId || null}
                    onSelectionChange={(key) => {
                      if (key !== null) setPriceId(String(key));
                    }}
                    variant="secondary"
                    className="w-full"
                  >
                    <Label>{t("web-ui:billing.admin.price")}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {dialogPrices.map((price) => (
                          <ListBox.Item
                            key={price.priceId}
                            id={price.priceId}
                            textValue={price.label}
                          >
                            {price.label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                ) : null}
                {dialog?.kind === "subscription" ? (
                  <div className="space-y-2">
                    <Select
                      aria-label={t("web-ui:billing.admin.startWith")}
                      selectedKey={start}
                      onSelectionChange={(key) => {
                        if (isSubscriptionStart(key)) setStart(key);
                      }}
                      variant="secondary"
                      className="w-full"
                    >
                      <Label>{t("web-ui:billing.admin.startWith")}</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {SUBSCRIPTION_STARTS.map((option) => (
                            <ListBox.Item
                              key={option}
                              id={option}
                              textValue={t(`web-ui:billing.admin.start.${option}`)}
                            >
                              {t(`web-ui:billing.admin.start.${option}`)}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t("web-ui:billing.admin.noCardHint")}
                    </p>
                  </div>
                ) : null}
                {dialog?.kind === "subscription" && start === "trial" ? (
                  <TextField value={trialDays} onChange={setTrialDays} variant="secondary">
                    <Label>{t("web-ui:billing.admin.trialDays")}</Label>
                    <Input type="number" min={1} max={MAX_TRIAL_DAYS} />
                  </TextField>
                ) : null}
                {showCouponSelect ? (
                  <Select
                    aria-label={t("web-ui:billing.admin.coupon")}
                    selectedKey={couponId || null}
                    onSelectionChange={(key) => {
                      if (key !== null) setCouponId(String(key));
                    }}
                    variant="secondary"
                    className="w-full"
                  >
                    <Label>{t("web-ui:billing.admin.coupon")}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {couponOptions.map((option) => (
                          <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                            {option.label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" slot="close">
                  {t("web-ui:common.cancel")}
                </Button>
                <Button onPress={handleConfirm} isDisabled={isConfirmDisabled}>
                  {t("web-ui:billing.admin.confirm")}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
