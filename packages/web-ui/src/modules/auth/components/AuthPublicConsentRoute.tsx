import { Button, Card, Checkbox, Label, toast } from "@heroui/react";
import type { createMcpTRPC } from "@m5kdev/backend/modules/mcp/mcp.trpc";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useMutation, useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProtectedRoute } from "../hooks/useProtectedRoute";

type McpConsentRouter = BackendTRPCRouter & {
  mcp: ReturnType<typeof createMcpTRPC>;
};

function consentRedirectUrl(data: unknown): string | undefined {
  if (data === null || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  if (typeof record.redirect_uri === "string" && record.redirect_uri.length > 0) {
    return record.redirect_uri;
  }
  if (typeof record.url === "string" && record.url.length > 0) {
    return record.url;
  }
  return undefined;
}

export function AuthPublicConsentRoute() {
  const { t } = useTranslation();
  const hasSession = useProtectedRoute();
  const [oauthClientId] = useQueryState("client_id", parseAsString);
  const trpc = useAppTRPC<McpConsentRouter>();
  const [selectedOverride, setSelectedOverride] = useState<string[] | null>(null);
  const organizationsQuery = useQuery(
    trpc.mcp.listConsentOrganizations.queryOptions(
      { oauthClientId: oauthClientId ?? "" },
      { enabled: hasSession && Boolean(oauthClientId) }
    )
  );
  const replaceAllowlist = useMutation(trpc.mcp.replaceConsentAllowlist.mutationOptions());
  const organizations = organizationsQuery.data ?? [];
  const selectedIds =
    selectedOverride ??
    organizations
      .filter((organization) => organization.allowlisted)
      .map((organization) => organization.id);
  const [submitting, setSubmitting] = useState<"allow" | "deny" | null>(null);

  const finishOAuth = async (accept: boolean): Promise<void> => {
    const oauthQuery = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
    const result = await authClient.$fetch("/oauth2/consent", {
      method: "POST",
      body: { accept, oauth_query: oauthQuery },
    });
    if (result.error) {
      toast.danger(t("web-ui:auth.errors.server"), {
        description: result.error.message,
      });
      return;
    }
    const redirectUrl = consentRedirectUrl(result.data);
    if (redirectUrl) {
      window.location.assign(redirectUrl);
    }
  };

  const onAllow = async (): Promise<void> => {
    if (!oauthClientId || organizationsQuery.isError || !organizationsQuery.data) return;
    setSubmitting("allow");
    try {
      await replaceAllowlist.mutateAsync({
        oauthClientId,
        organizationIds: selectedIds,
      });
      await finishOAuth(true);
    } catch (error) {
      toast.danger(t("web-ui:auth.errors.server"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSubmitting(null);
    }
  };

  const onDeny = async (): Promise<void> => {
    setSubmitting("deny");
    try {
      await finishOAuth(false);
    } finally {
      setSubmitting(null);
    }
  };

  if (!hasSession) return null;

  if (!oauthClientId) {
    return (
      <Card>
        <Card.Header className="flex flex-col gap-1 text-center">
          <p className="text-xl font-semibold">{t("web-ui:auth.consent.missingClient.title")}</p>
          <p className="text-sm text-default-600">
            {t("web-ui:auth.consent.missingClient.description")}
          </p>
        </Card.Header>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Card.Header className="flex flex-col gap-1 text-center">
          <p className="text-xl font-semibold">{t("web-ui:auth.consent.title")}</p>
          <p className="text-sm text-default-600">{t("web-ui:auth.consent.description")}</p>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {organizationsQuery.isError ? (
            <p className="text-sm text-danger">{t("web-ui:auth.consent.loadError")}</p>
          ) : organizationsQuery.isLoading ? (
            <p className="text-sm text-default-500">{t("web-ui:common.loading")}</p>
          ) : organizations.length === 0 ? (
            <p className="text-sm text-default-500">{t("web-ui:auth.consent.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {organizations.map((organization) => {
                const isSelected = selectedIds.includes(organization.id);
                return (
                  <li key={organization.id} data-testid={`mcp-consent-org-${organization.id}`}>
                    <Checkbox
                      isSelected={isSelected}
                      onChange={(isSelectedValue) => {
                        const next = isSelectedValue
                          ? [...selectedIds, organization.id]
                          : selectedIds.filter((id) => id !== organization.id);
                        setSelectedOverride(next);
                      }}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <Label>{organization.name}</Label>
                    </Checkbox>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-col gap-2">
            <Button
              data-testid="mcp-consent-allow"
              isDisabled={
                organizationsQuery.isLoading ||
                organizationsQuery.isError ||
                !organizationsQuery.data ||
                submitting !== null
              }
              onPress={() => {
                void onAllow();
              }}
            >
              {submitting === "allow"
                ? t("web-ui:auth.consent.allowing")
                : t("web-ui:auth.consent.allow")}
            </Button>
            <Button
              variant="secondary"
              isDisabled={submitting !== null}
              onPress={() => {
                void onDeny();
              }}
            >
              {t("web-ui:auth.consent.deny")}
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
