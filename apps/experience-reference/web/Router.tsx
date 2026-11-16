import { Button } from "@heroui/react";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { BillingProvider } from "@m5kdev/frontend/modules/billing/components/BillingProvider";
import { EntitlementProvider } from "@m5kdev/frontend/modules/billing/components/EntitlementProvider";
import { useEntitlement } from "@m5kdev/frontend/modules/billing/hooks/useEntitlements";
import { useSubscription } from "@m5kdev/frontend/modules/billing/hooks/useSubscription";
import { AuthOrganizationMembersRoute } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationMembersRoute";
import { AuthOrganizationPreferences } from "@m5kdev/web-ui/modules/auth/components/AuthOrganizationPreferences";
import { AuthPublicRouter } from "@m5kdev/web-ui/modules/auth/components/AuthPublicRouter";
import { BillingInvoicePage } from "@m5kdev/web-ui/modules/billing/components/BillingInvoicePage";
import { BillingSinglePlanSelect } from "@m5kdev/web-ui/modules/billing/components/BillingSinglePlanSelect";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Outlet, Route, Routes } from "react-router";
import { z } from "zod";
import { catalog } from "../server/catalog";
import { useReference } from "./hooks/useReference";

function SharedWorkflow() {
  const { t } = useTranslation("reference");
  const decision = useEntitlement("reports.publish");
  const assistant = useEntitlement("assistant.use");
  const { publish, action } = useReference();
  return (
    <section className="space-y-3">
      <output className="block font-mono text-sm" data-testid="decision">
        {JSON.stringify(decision)}
      </output>
      <output className="block font-mono text-sm" data-testid="assistant">
        {JSON.stringify(assistant)}
      </output>
      {decision.isError ? (
        <p role="alert">{t("error")}</p>
      ) : decision.isPending ? (
        <p role="status">{t("pending")}</p>
      ) : decision.allowed ? (
        <Button onPress={publish}>{t("publish")}</Button>
      ) : (
        <p>{t("denied")}</p>
      )}
      {action ? <p data-testid="action">{t(action)}</p> : null}
    </section>
  );
}
function PaidContent() {
  const { data } = useSubscription();
  const { t } = useTranslation("reference");
  return (
    <div data-testid="paid">
      {t("paid")}
      <output className="block font-mono text-sm" data-testid="subscription">
        {data?.plan ?? "exempt"}
      </output>
      <BillingInvoicePage />
    </div>
  );
}
function Product({ navigation }: { navigation: React.ReactNode }) {
  const { t, i18n } = useTranslation("reference");
  const { experience } = useAppConfig();
  const { data: session } = useSession();
  const reference = useReference();
  if (!session) return <Navigate to="/login" replace />;
  return (
    <main
      className="mx-auto max-w-5xl space-y-4 p-6"
      data-testid="shell"
      data-product={experience?.product}
    >
      {navigation}
      <Outlet />
      <nav className="flex flex-wrap gap-2">
        {["reports", "combined", "unpaid", "exempt", "denied"].map((id) => (
          <Button
            key={id}
            isDisabled={reference.switching}
            onPress={() => void reference.switchOrganization(`org_${id}`)}
          >
            {id}
          </Button>
        ))}
      </nav>
      <output className="block font-mono text-sm" data-testid="active-org">
        {reference.organizationId}
      </output>
      <output className="block font-mono text-sm" data-testid="locale">
        {i18n.language}
      </output>
      <output className="block font-mono text-sm" data-testid="preferences">
        {JSON.stringify(reference.preferences)}
      </output>
      <Button onPress={() => void reference.refresh()}>{t("refresh")}</Button>
      <Button onPress={() => void reference.refreshSubscription()}>
        {t("refreshSubscription")}
      </Button>
      <EntitlementProvider>
        <SharedWorkflow />
      </EntitlementProvider>
      <BillingProvider
        loader={<p>{t("pending")}</p>}
        planPage={
          <div data-testid="plans">
            {t("plans")}
            <BillingSinglePlanSelect plan={catalog.plans[0]} currency="usd" features={[]} />
          </div>
        }
        errorPage={
          <p data-testid="billing-error" role="alert">
            {t("error")}
          </p>
        }
      >
        <PaidContent />
      </BillingProvider>
    </main>
  );
}
function ReportsShell() {
  const { t } = useTranslation("reference");
  return <Product navigation={<Link to="/reports">{t("reportsNavigation")}</Link>} />;
}
function AssistantShell() {
  const { t } = useTranslation("reference");
  return <Product navigation={<Link to="/assistant">{t("assistantNavigation")}</Link>} />;
}
function ReportsWorkflow() {
  const { t } = useTranslation("reference");
  return <h2 data-testid="workflow">{t("reports")}</h2>;
}
function AssistantWorkflow() {
  const { t } = useTranslation("reference");
  return <h2 data-testid="workflow">{t("assistant")}</h2>;
}
const referencePreferencesSchema = z.object({
  referenceOffice: z.boolean().optional(),
});
function OrganizationPreferences() {
  const { t } = useTranslation("reference");
  return (
    <AuthOrganizationPreferences
      schema={referencePreferencesSchema}
      controls={{
        referenceOffice: {
          label: t("organizationPreference"),
          element: "switch",
        },
      }}
    />
  );
}
export function Router() {
  const { experience } = useAppConfig();
  const reports = experience?.product === "reports";
  const workflow = reports ? <ReportsWorkflow /> : <AssistantWorkflow />;
  return (
    <Routes>
      {AuthPublicRouter({ header: <span />, providers: [] })}
      <Route element={reports ? <ReportsShell /> : <AssistantShell />}>
        <Route index element={workflow} />
        <Route path={reports ? "reports" : "assistant"} element={workflow} />
        <Route path="supplied" element={workflow} />
        <Route path="members" element={<AuthOrganizationMembersRoute />} />
        <Route path="organization-preferences" element={<OrganizationPreferences />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
