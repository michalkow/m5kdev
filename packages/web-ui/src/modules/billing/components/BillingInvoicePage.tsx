import { Button, Card, Chip, Spinner, Table } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { useSubscription } from "@m5kdev/frontend/modules/billing/hooks/useSubscription";
import { cn } from "@m5kdev/web-ui/utils";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { Link } from "react-router";

export function BillingInvoicePage() {
  const { serverUrl } = useAppConfig();
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const { data: invoices, isLoading } = useQuery(trpc.billing.listInvoices.queryOptions());

  const { data: activeSubscription, isLoading: isLoadingSubscriptions } = useSubscription();
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (timestamp: number | Date) => {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
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
          <h1 className="text-xl font-bold">Active Subscription</h1>
          <p className="text-small text-default-500">Manage your active subscription.</p>
        </Card.Header>
        <Card.Content className="px-6 pb-6">
          {isLoadingSubscriptions ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !activeSubscription ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-4">
              <div className="p-4 rounded-full bg-default-100">
                <AlertCircle className="w-8 h-8 text-default-500" />
              </div>
              <div>
                <p className="text-lg font-medium">No active subscription</p>
                <p className="text-small text-default-500">
                  You are currently on the free tier. Upgrade to access premium features.
                </p>
              </div>
              <Link
                to="/pricing"
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium",
                  "bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                )}
              >
                View Plans
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 rounded-lg bg-default-50 border border-default-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold capitalize">
                      {activeSubscription.plan || "Premium Plan"}
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
                      {cancelAt ? "Cancelled" : activeSubscription.status}
                    </Chip>
                  </div>
                  <p className="text-small text-default-500 flex items-center gap-2">
                    {cancelAt ? "Your subscription will end on " : "Next billing date: "}
                    <span className="font-medium text-foreground">
                      {activeSubscription.periodEnd
                        ? formatDate(activeSubscription.periodEnd)
                        : "N/A"}
                    </span>
                    <span className="text-small text-default-500">
                      {`(${activeSubscription.interval === "month" ? "Monthly" : "Annually"})`}
                    </span>
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onPress={() => {
                      window.location.assign(`${serverUrl}/stripe/portal`);
                    }}
                  >
                    Manage Subscription
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card.Content>
      </Card>
      <Card>
        <Card.Header className="flex flex-col items-start gap-1 px-6 pt-6">
          <h1 className="text-xl font-bold">Invoices</h1>
          <p className="text-small text-default-500">
            View your invoice history and download past invoices.
          </p>
        </Card.Header>
        <Card.Content className="px-6 pb-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : invoiceRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-default-500">No invoices found.</div>
          ) : (
            <Table aria-label="Invoices table">
              <Table.ScrollContainer>
                <Table.Content>
                  <Table.Header>
                    <Table.Column>Date</Table.Column>
                    <Table.Column>Amount</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column className="text-right">Action</Table.Column>
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
                              View
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
