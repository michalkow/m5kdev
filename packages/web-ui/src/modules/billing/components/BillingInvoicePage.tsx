import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Link,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { useSubscription } from "@m5kdev/frontend/modules/billing/hooks/useSubscription";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";

import type { UseBackendTRPC } from "../../../types";

interface BillingInvoicePageProps {
  useTRPC: UseBackendTRPC;
  serverUrl: string;
}

export function BillingInvoicePage({ useTRPC, serverUrl }: BillingInvoicePageProps) {
  const trpc = useTRPC();
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
  return (
    <div className="container mx-auto p-10 space-y-8">
      <Card>
        <CardHeader className="flex flex-col items-start gap-1 px-6 pt-6">
          <h1 className="text-xl font-bold">Active Subscription</h1>
          <p className="text-small text-default-500">Manage your active subscription.</p>
        </CardHeader>
        <CardBody className="px-6 pb-6">
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
              <Button as={Link} href="/pricing" color="primary">
                View Plans
              </Button>
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
                      variant="flat"
                      size="sm"
                      startContent={<CheckCircle2 className="w-3 h-3 ml-1" />}
                    >
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
                  <Button variant="bordered" as="a" href={`${serverUrl}/stripe/portal`}>
                    Manage Subscription
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader className="flex flex-col items-start gap-1 px-6 pt-6">
          <h1 className="text-xl font-bold">Invoices</h1>
          <p className="text-small text-default-500">
            View your invoice history and download past invoices.
          </p>
        </CardHeader>
        <CardBody className="px-6 pb-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <Table aria-label="Invoices table" removeWrapper>
              <TableHeader>
                <TableColumn>Date</TableColumn>
                <TableColumn>Amount</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn align="end">Action</TableColumn>
              </TableHeader>
              <TableBody emptyContent="No invoices found.">
                {(invoices || []).map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{formatDate(invoice.created)}</TableCell>
                    <TableCell>{formatCurrency(invoice.total, invoice.currency)}</TableCell>
                    <TableCell>
                      <Chip
                        color={invoice.status === "paid" ? "success" : "default"}
                        variant="flat"
                        size="sm"
                      >
                        {invoice.status}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-right">
                      {invoice.hosted_invoice_url && (
                        <Button
                          as={Link}
                          href={invoice.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="light"
                          size="sm"
                          endContent={<ExternalLink className="h-4 w-4" />}
                        >
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
