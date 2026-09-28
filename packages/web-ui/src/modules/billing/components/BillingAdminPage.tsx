import { Button, Input, Label, ListBox, Modal, Select, TextField } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import type { StripePlan } from "@m5kdev/commons/modules/billing/billing.types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useMemo, useState } from "react";
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

function pricesForCurrency({
  plans,
  currency,
}: {
  plans: readonly StripePlan[];
  currency: string;
}): Array<{ priceId: string; label: string }> {
  const rows: Array<{ priceId: string; label: string }> = [];
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

export function BillingAdminPage({ plans }: { plans: readonly StripePlan[] }) {
  const { t } = useTranslation();
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();
  const [enrollRow, setEnrollRow] = useState<BillingAdminRow | null>(null);
  const [priceId, setPriceId] = useState("");
  const [durationKind, setDurationKind] = useState<"forever" | "once" | "repeating">("forever");
  const [months, setMonths] = useState(1);

  const { params: tableParams, query } = useNuqsTable<
    ListBillingAdminInput,
    ListBillingAdminOutput
  >({
    getQueryOptions: (input) => trpc.billing.listAdminOrganizationBilling.queryOptions(input),
    prefix: "ba",
  });

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: trpc.billing.listAdminOrganizationBilling.queryKey(),
    });
  };

  const enroll = useMutation(
    trpc.billing.enrollComplimentary.mutationOptions({
      onSuccess: async () => {
        toast.success(t("web-ui:billing.admin.enrollSuccess"));
        setEnrollRow(null);
        await invalidate();
      },
      onError: (error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
      },
    })
  );

  const remove = useMutation(
    trpc.billing.removeComplimentary.mutationOptions({
      onSuccess: async () => {
        toast.success(t("web-ui:billing.admin.removeSuccess"));
        await invalidate();
      },
      onError: (error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
      },
    })
  );

  const cancelSub = useMutation(
    trpc.billing.cancelAdminSubscription.mutationOptions({
      onSuccess: async () => {
        toast.success(t("web-ui:billing.admin.cancelSuccess"));
        await invalidate();
      },
      onError: (error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
      },
    })
  );

  const columns = useMemo(
    (): NuqsTableColumn<BillingAdminRow>[] => [
      {
        id: "organizationName",
        accessorKey: "organizationName",
        header: t("web-ui:billing.admin.organization"),
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
          row.subscription?.trialEnd
            ? new Date(row.subscription.trialEnd).toLocaleDateString()
            : "—",
        header: t("web-ui:billing.admin.trialEnd"),
      },
      {
        id: "complimentary",
        accessorFn: (row) =>
          (row.subscription?.discounts?.length ?? 0) > 0
            ? t("web-ui:billing.admin.yes")
            : t("web-ui:billing.admin.no"),
        header: t("web-ui:billing.admin.complimentary"),
      },
      {
        id: "actions",
        header: t("web-ui:billing.admin.actions"),
        cell: ({ row }) => {
          const item = row.original;
          const hasSubscription = Boolean(item.subscription?.stripeSubscriptionId);
          const hasComplimentary = (item.subscription?.discounts?.length ?? 0) > 0;
          return (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  const currency =
                    item.currency ?? (plans[0] ? Object.keys(plans[0].products)[0] : "usd");
                  const first = pricesForCurrency({ plans, currency })[0];
                  setPriceId(first?.priceId ?? "");
                  setDurationKind("forever");
                  setEnrollRow(item);
                }}
              >
                {t("web-ui:billing.admin.enroll")}
              </Button>
              {hasComplimentary ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => remove.mutate({ organizationId: item.organizationId })}
                >
                  {t("web-ui:billing.admin.remove")}
                </Button>
              ) : null}
              {hasSubscription ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() =>
                      cancelSub.mutate({
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
                      cancelSub.mutate({
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
    ],
    [cancelSub, plans, remove, t]
  );

  const enrollCurrency =
    enrollRow?.currency ?? (plans[0] ? Object.keys(plans[0].products)[0] : "usd");
  const enrollPrices = enrollRow ? pricesForCurrency({ plans, currency: enrollCurrency }) : [];

  const handleEnroll = (): void => {
    if (!enrollRow || !priceId) return;
    enroll.mutate({
      organizationId: enrollRow.organizationId,
      priceId,
      duration: durationKind === "repeating" ? { months } : durationKind,
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("web-ui:billing.admin.title")}</h1>
      <NuqsTable<BillingAdminRow>
        data={query.data?.rows ?? []}
        total={query.data?.total ?? 0}
        columns={columns}
        tableProps={tableParams}
        showGlobalSearch
        hideFilters
      />

      <Modal isOpen={Boolean(enrollRow)} onOpenChange={(open) => !open && setEnrollRow(null)}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>{t("web-ui:billing.admin.enrollTitle")}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="space-y-4">
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
                      {enrollPrices.map((price) => (
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
                <Select
                  aria-label={t("web-ui:billing.admin.duration")}
                  selectedKey={durationKind}
                  onSelectionChange={(key) => {
                    if (key === "forever" || key === "once" || key === "repeating") {
                      setDurationKind(key);
                    }
                  }}
                  variant="secondary"
                  className="w-full"
                >
                  <Label>{t("web-ui:billing.admin.duration")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="forever" textValue={t("web-ui:billing.admin.forever")}>
                        {t("web-ui:billing.admin.forever")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="once" textValue={t("web-ui:billing.admin.once")}>
                        {t("web-ui:billing.admin.once")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item id="repeating" textValue={t("web-ui:billing.admin.repeating")}>
                        {t("web-ui:billing.admin.repeating")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
                {durationKind === "repeating" ? (
                  <TextField
                    value={String(months)}
                    onChange={(value) => setMonths(Number(value) || 1)}
                    variant="secondary"
                  >
                    <Label>{t("web-ui:billing.admin.months")}</Label>
                    <Input type="number" min={1} />
                  </TextField>
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" slot="close">
                  {t("web-ui:common.cancel")}
                </Button>
                <Button onPress={handleEnroll} isDisabled={!priceId || enroll.isPending}>
                  {t("web-ui:billing.admin.enroll")}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
