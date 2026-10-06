import type { AdminOrganizationBillingRow } from "@m5kdev/commons/modules/billing/billing.schema";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingAdminPage } from "../components/BillingAdminPage";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock("@m5kdev/frontend/modules/app/hooks/useAppTrpc", () => ({
  useAppTRPC: () => ({
    billing: {
      listAdminOrganizationBilling: {
        queryOptions: () => ({ queryKey: ["list"] }),
        queryKey: () => ["list"],
      },
      listAdminCoupons: {
        queryOptions: () => ({ queryKey: ["coupons"] }),
      },
      setAdminOrganizationCurrency: { mutationOptions: () => ({}) },
      createAdminCustomer: { mutationOptions: () => ({}) },
      createAdminSubscription: { mutationOptions: () => ({}) },
      applyAdminCoupon: { mutationOptions: () => ({}) },
      removeAdminCoupon: { mutationOptions: () => ({}) },
      cancelAdminSubscription: { mutationOptions: () => ({}) },
      setAdminBillingExempt: { mutationOptions: () => ({}) },
      setAdminAllowCardlessTrial: { mutationOptions: () => ({}) },
    },
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
  useMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const unpaidRow: AdminOrganizationBillingRow = {
  id: "org-1",
  organizationId: "org-1",
  organizationName: "Acme",
  currency: null,
  stripeCustomerId: null,
  defaultTrialDays: 14,
  billingExempt: false,
  allowCardlessTrial: false,
  openSubscription: false,
  subscription: null,
  coupon: null,
};

const subscribedRow: AdminOrganizationBillingRow = {
  ...unpaidRow,
  currency: "usd",
  stripeCustomerId: "cus_1",
  openSubscription: true,
  subscription: {
    id: "sub-row",
    plan: "pro",
    referenceId: "org-1",
    status: "active",
  },
  coupon: {
    id: "free_forever",
    name: "Free",
    percentOff: 100,
    amountOff: null,
    currency: null,
    duration: "forever",
    durationInMonths: null,
    valid: true,
  },
};

let tableRows: AdminOrganizationBillingRow[] = [unpaidRow];

jest.mock("../../table/hooks/useNuqsTable", () => ({
  __esModule: true,
  default: () => ({
    params: { rowSelection: {}, setRowSelection: jest.fn() },
    query: {
      data: { rows: tableRows, total: tableRows.length, environment: "sandbox" },
    },
  }),
}));

jest.mock("../../table/components/NuqsTable", () => ({
  NuqsTable: ({
    columns,
    data,
  }: {
    columns: Array<{
      id: string;
      cell?: (ctx: { row: { original: AdminOrganizationBillingRow } }) => ReactNode;
    }>;
    data: AdminOrganizationBillingRow[];
  }) => (
    <div>
      {data.map((row) =>
        columns.map((column) => (
          <div key={`${row.id}-${column.id}`} data-column={column.id}>
            {column.cell?.({ row: { original: row } })}
          </div>
        ))
      )}
    </div>
  ),
}));

jest.mock(
  "@heroui/react",
  () => {
    function Button({ children, ...props }: { children?: ReactNode; "aria-label"?: string }) {
      return (
        <button type="button" aria-label={props["aria-label"]}>
          {children}
        </button>
      );
    }
    function Switch({ children, isSelected }: { children?: ReactNode; isSelected?: boolean }) {
      return <div data-switch={String(Boolean(isSelected))}>{children}</div>;
    }
    Switch.Control = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
    Switch.Thumb = () => <span />;
    function Dropdown({ children }: { children?: ReactNode }) {
      return <div data-dropdown="true">{children}</div>;
    }
    Dropdown.Trigger = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Dropdown.Popover = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Dropdown.Menu = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Dropdown.Item = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    function Chip({ children }: { children?: ReactNode }) {
      return <span>{children}</span>;
    }
    function Modal({ children }: { children?: ReactNode }) {
      return <div>{children}</div>;
    }
    Modal.Backdrop = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Modal.Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Modal.Dialog = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Modal.CloseTrigger = () => null;
    Modal.Header = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Modal.Heading = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Modal.Body = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    Modal.Footer = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    return {
      Button,
      Switch,
      Dropdown,
      Chip,
      Modal,
      Input: () => null,
      Label: () => null,
      ListBox: () => null,
      Select: () => null,
      TextField: () => null,
    };
  },
  { virtual: true }
);

describe("BillingAdminPage", () => {
  it("puts unpaid row actions in a kebab instead of a Button strip", () => {
    tableRows = [unpaidRow];
    const markup = renderToStaticMarkup(<BillingAdminPage plans={[]} />);
    expect(markup).toContain('data-dropdown="true"');
    expect(markup).toContain("web-ui:billing.admin.rowActions");
    expect(markup).toContain("web-ui:billing.admin.setCurrency");
    expect(markup).toContain("web-ui:billing.admin.createCustomer");
    expect(markup).not.toContain("web-ui:billing.admin.createSubscription");
    expect(markup).toContain('data-switch="false"');
    expect(markup).not.toContain('data-column="allowCardlessTrial"');
  });

  it("shows the cardless Trial Switch only when the catalog requires a card", () => {
    tableRows = [unpaidRow];
    const markup = renderToStaticMarkup(<BillingAdminPage plans={[]} trialRequiresPaymentMethod />);
    expect(markup).toContain('data-column="allowCardlessTrial"');
    expect(markup).toContain('data-column="billingExempt"');
  });

  it("lists coupon and cancel items for an open Subscription and keeps the exempt Switch", () => {
    tableRows = [subscribedRow];
    const markup = renderToStaticMarkup(<BillingAdminPage plans={[]} />);
    expect(markup).toContain('data-dropdown="true"');
    expect(markup).toContain("web-ui:billing.admin.applyCoupon");
    expect(markup).toContain("web-ui:billing.admin.removeCoupon");
    expect(markup).toContain("web-ui:billing.admin.cancelPeriodEnd");
    expect(markup).toContain("web-ui:billing.admin.cancelNow");
    expect(markup).not.toContain("web-ui:billing.admin.createSubscription");
    expect(markup).toContain('data-switch="false"');
    expect(markup).not.toContain('data-column="allowCardlessTrial"');
  });
});
