import { Button, Card, Chip, Spinner, Table } from "@heroui/react";
import { formatBillingInterval } from "@m5kdev/commons/modules/billing/billing.utils";
import { useSubscription } from "@m5kdev/frontend/modules/billing/hooks/useSubscription";
import { cn } from "@m5kdev/web-ui/utils";
import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useBillingActions } from "../hooks/useBillingActions";
import { useBillingInvoices } from "../hooks/useBillingInvoices";

export function BillingInvoicePage() {
  const { t, i18n } = useTranslation("web-ui");
  const billing = useBillingActions();
  const { data: invoices, isPending: isLoading, isError } = useBillingInvoices();

  const {
    data: activeSubscription,
    isLoading: isLoadingSubscriptions,
    isError: isSubscriptionError,
  } = useSubscription();
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (timestamp: number | Date) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp * 1000);
    return date.toLocaleDateString(i18n.language, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const cancelAt = activeSubscription?.cancelAt || activeSubscription?.cancelAtPeriodEnd;
  const invoiceRows = invoices ?? [];

  return (
    <div className="container mx-auto p-10 space-y-8">
      <Card>
        <Card.Header className="flex flex-col items-start gap-1 px-6 pt-6">
          <h1 className="text-xl font-bold">{t("billing.invoice.active")}</h1>
          <p className="text-small text-default-500">{t("billing.invoice.manage")}</p>
        </Card.Header>
        <Card.Content className="px-6 pb-6">
          {isSubscriptionError ? (
            <p role="alert">{t("billing.loadError")}</p>
          ) : isLoadingSubscriptions ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !activeSubscription ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-4">
              <div className="p-4 rounded-full bg-default-100">
                <AlertCircle className="w-8 h-8 text-default-500" />
              </div>
              <div>
                <p className="text-lg font-medium">{t("billing.invoice.noSubscription")}</p>
                <p className="text-small text-default-500">
                  {t("billing.invoice.noSubscriptionDetails")}
                </p>
              </div>
              <Link
                to="/pricing"
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium",
                  "bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                )}
              >
                {t("billing.invoice.plans")}
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 rounded-lg bg-default-50 border border-default-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold capitalize">
                      {activeSubscription.plan || t("billing.invoice.premium")}
                    </h3>

                    <Chip
                      color={
                        cancelAt
                          ? "danger"
                          : activeSubscription.status === "active"
                            ? "success"
                            : "warning"
                      }
                      variant="soft"
                      size="sm"
                      className="inline-flex items-center gap-1 capitalize"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {cancelAt ? t("billing.invoice.cancelled") : activeSubscription.status}
                    </Chip>
                  </div>
                  <p className="text-small text-default-500 flex items-center gap-2">
                    {t(cancelAt ? "billing.invoice.ends" : "billing.invoice.next")}
                    <span className="font-medium text-foreground">
                      {activeSubscription.periodEnd
                        ? formatDate(activeSubscription.periodEnd)
                        : t("billing.invoice.unavailable")}
                    </span>
                    <span className="text-small text-default-500">
                      {`(${formatBillingInterval({
                        interval: activeSubscription.interval,
                        intervalCount: activeSubscription.intervalCount,
                      })})`}
                    </span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    isDisabled={!billing.canStart}
                    isPending={billing.isPortalPending}
                    onPress={() => void billing.startPortal()}
                  >
                    {t("billing.invoice.portal")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card.Content>
      </Card>
      <Card>
        <Card.Header className="flex flex-col items-start gap-1 px-6 pt-6">
          <h1 className="text-xl font-bold">{t("billing.invoice.title")}</h1>
          <p className="text-small text-default-500">{t("billing.invoice.description")}</p>
        </Card.Header>
        <Card.Content className="px-6 pb-6">
          {isError ? (
            <p role="alert">{t("billing.loadError")}</p>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : invoiceRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-default-500">
              {t("billing.invoice.empty")}
            </div>
          ) : (
            <Table aria-label={t("billing.invoice.title")}>
              <Table.ScrollContainer>
                <Table.Content>
                  <Table.Header>
                    <Table.Column isRowHeader>{t("billing.invoice.date")}</Table.Column>
                    <Table.Column>{t("billing.invoice.amount")}</Table.Column>
                    <Table.Column>{t("billing.invoice.status")}</Table.Column>
                    <Table.Column className="text-right">
                      {t("billing.invoice.action")}
                    </Table.Column>
                  </Table.Header>
                  <Table.Body items={invoiceRows}>
                    {(invoice) => (
                      <Table.Row id={invoice.id}>
                        <Table.Cell>{formatDate(invoice.created)}</Table.Cell>
                        <Table.Cell>{formatCurrency(invoice.total, invoice.currency)}</Table.Cell>
                        <Table.Cell>
                          <Chip
                            color={invoice.status === "paid" ? "success" : "default"}
                            variant="soft"
                            size="sm"
                            className="capitalize"
                          >
                            {invoice.status}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="text-right">
                          {invoice.hosted_invoice_url ? (
                            <a
                              href={invoice.hosted_invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "inline-flex items-center gap-1 text-sm font-medium text-primary",
                                "underline-offset-4 hover:underline"
                              )}
                            >
                              {t("billing.invoice.view")}
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null}
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
