import { Button, Card, Chip, Input, Label, Modal, Spinner, Table, TextArea } from "@heroui/react";
import type { BackendTRPCRouter } from "@m5kdev/backend/types";
import { useAppTRPC } from "@m5kdev/frontend/modules/app/hooks/useAppTrpc";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Plus, Settings2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type ChildOrganization = {
  id: string;
  name: string;
  slug: string | null;
  parentId: string | null;
  type: string | null;
  logo: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
};

export type OrganizationChildOrganizationsRouteProps = {
  managerRoles?: string[];
  onInvalidateScopedQueries?: () => void | Promise<void>;
};

function OrganizationStateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-6">
      <Card>
        <Card.Header className="text-lg font-semibold">{title}</Card.Header>
        <Card.Content>{message}</Card.Content>
      </Card>
    </div>
  );
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function useChildOrganizationAccess({
  managerRoles,
  onInvalidateScopedQueries,
}: OrganizationChildOrganizationsRouteProps) {
  const { data: session, registerSession } = useSession();
  const queryClient = useQueryClient();

  const activeOrganizationId = session?.session.activeOrganizationId ?? "";
  const activeOrganizationRole =
    (session?.session as { activeOrganizationRole?: string } | undefined)?.activeOrganizationRole ??
    "";
  const activeOrganizationType =
    (session?.session as { activeOrganizationType?: string } | undefined)?.activeOrganizationType ??
    "";

  const managerRoleSet = useMemo(() => new Set(managerRoles ?? ["admin", "owner"]), [managerRoles]);
  const canManageOrganization = managerRoleSet.has(activeOrganizationRole);
  const canUseChildOrganizations =
    Boolean(activeOrganizationId) && ["enterprise", "agency"].includes(activeOrganizationType);

  const refreshOrganizationQueries = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["auth-organization-list"] }),
    ]);
    registerSession(() => {
      void onInvalidateScopedQueries?.();
    });
  }, [onInvalidateScopedQueries, queryClient, registerSession]);

  return {
    activeOrganizationId,
    activeOrganizationRole,
    activeOrganizationType,
    canManageOrganization,
    canUseChildOrganizations,
    refreshOrganizationQueries,
  };
}

export function OrganizationChildOrganizationsRoute({
  managerRoles,
  onInvalidateScopedQueries,
}: OrganizationChildOrganizationsRouteProps) {
  const { t } = useTranslation();
  const trpc = useAppTRPC<BackendTRPCRouter>();
  const queryClient = useQueryClient();

  const {
    activeOrganizationId,
    activeOrganizationRole,
    canManageOrganization,
    canUseChildOrganizations,
    refreshOrganizationQueries,
  } = useChildOrganizationAccess({ managerRoles, onInvalidateScopedQueries });

  const childOrganizationsQuery = useQuery(
    trpc.auth.listChildOrganizations.queryOptions(undefined, {
      enabled: Boolean(activeOrganizationId && canUseChildOrganizations && canManageOrganization),
    })
  );

  const createNameInputId = useId();
  const editNameInputId = useId();
  const editSlugInputId = useId();
  const editMetadataInputId = useId();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newOrganizationName, setNewOrganizationName] = useState("");

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<string | null>(null);
  const [editingOrganizationId, setEditingOrganizationId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingSlug, setEditingSlug] = useState("");
  const [editingMetadata, setEditingMetadata] = useState("{}");

  const { mutate: createOrganization, isPending: isCreating } = useMutation(
    trpc.auth.createOrganization.mutationOptions({
      onSuccess: async () => {
        toast.success(t("web-ui:organization.childOrgs.createSuccess"));
        setNewOrganizationName("");
        setIsCreateOpen(false);
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: trpc.auth.listChildOrganizations.queryKey() }),
          refreshOrganizationQueries(),
        ]);
      },
      onError: (error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : t("web-ui:organization.childOrgs.createError")
        );
      },
    })
  );

  const { mutate: updateOrganization, isPending: isUpdating } = useMutation(
    trpc.auth.updateChildOrganization.mutationOptions({
      onSuccess: async () => {
        toast.success(t("web-ui:organization.childOrgs.updateSuccess"));
        setIsEditOpen(false);
        setEditingOrganizationId(null);
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: trpc.auth.listChildOrganizations.queryKey() }),
          refreshOrganizationQueries(),
        ]);
      },
      onError: (error: unknown) => {
        toast.error(
          error instanceof Error ? error.message : t("web-ui:organization.childOrgs.updateError")
        );
      },
    })
  );

  const onOpenEdit = useCallback((org: ChildOrganization) => {
    setEditingOrganizationId(org.id);
    setEditingName(org.name ?? "");
    setEditingSlug(org.slug ?? "");
    setEditingMetadata(safeStringify(org.metadata ?? {}));
    setIsEditOpen(true);
  }, []);

  const onSwitchToChild = useCallback(
    async (organizationId: string) => {
      if (
        !organizationId ||
        organizationId === activeOrganizationId ||
        switchingOrganizationId !== null
      ) {
        return;
      }

      try {
        setSwitchingOrganizationId(organizationId);
        const { error } = await authClient.organization.setActive({ organizationId });
        if (error) {
          throw new Error(
            error.message ?? t("web-ui:organization.switcher.failedToSwitchOrganization")
          );
        }

        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: trpc.auth.listChildOrganizations.queryKey() }),
          refreshOrganizationQueries(),
        ]);
        toast.success(t("web-ui:organization.switcher.organizationSwitched"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("web-ui:organization.switcher.failedToSwitchOrganization")
        );
      } finally {
        setSwitchingOrganizationId(null);
      }
    },
    [
      activeOrganizationId,
      queryClient,
      refreshOrganizationQueries,
      switchingOrganizationId,
      t,
      trpc.auth.listChildOrganizations,
    ]
  );

  const onSubmitCreate = useCallback(() => {
    const name = newOrganizationName.trim();
    if (!name) {
      toast.error(t("web-ui:organization.childOrgs.createError"));
      return;
    }
    createOrganization({ name });
  }, [createOrganization, newOrganizationName, t]);

  const onSubmitEdit = useCallback(() => {
    if (!editingOrganizationId) return;
    let parsedMetadata: Record<string, unknown>;
    try {
      parsedMetadata = editingMetadata.trim()
        ? (JSON.parse(editingMetadata) as Record<string, unknown>)
        : {};
    } catch (parseError) {
      const message =
        parseError instanceof SyntaxError
          ? t("web-ui:organization.childOrgs.form.metadataInvalidJson")
          : parseError instanceof Error
            ? parseError.message
            : t("web-ui:organization.childOrgs.form.metadataInvalid");
      toast.error(message);
      return;
    }

    updateOrganization({
      organizationId: editingOrganizationId,
      name: editingName.trim(),
      slug: editingSlug.trim() ? editingSlug.trim() : null,
      metadata: parsedMetadata,
    });
  }, [editingMetadata, editingName, editingOrganizationId, editingSlug, t, updateOrganization]);

  useEffect(() => {
    if (!isEditOpen) {
      setEditingOrganizationId(null);
      setEditingName("");
      setEditingSlug("");
      setEditingMetadata("{}");
    }
  }, [isEditOpen]);

  if (!activeOrganizationId) {
    return (
      <OrganizationStateCard
        title={t("web-ui:organization.childOrgs.title")}
        message={t("web-ui:organization.childOrgs.noActive")}
      />
    );
  }

  if (!canUseChildOrganizations) {
    return (
      <OrganizationStateCard
        title={t("web-ui:organization.childOrgs.title")}
        message={t("web-ui:organization.childOrgs.wrongType")}
      />
    );
  }

  if (!canManageOrganization) {
    return (
      <OrganizationStateCard
        title={t("web-ui:organization.childOrgs.title")}
        message={t("web-ui:organization.childOrgs.manageOnly")}
      />
    );
  }

  if (childOrganizationsQuery.isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Spinner />
      </div>
    );
  }

  if (childOrganizationsQuery.isError) {
    return (
      <OrganizationStateCard
        title={t("web-ui:organization.childOrgs.title")}
        message={
          childOrganizationsQuery.error instanceof Error
            ? childOrganizationsQuery.error.message
            : t("web-ui:organization.childOrgs.loadError")
        }
      />
    );
  }

  const childOrganizations = (childOrganizationsQuery.data ?? []) as ChildOrganization[];

  return (
    <div className="p-6">
      <Card>
        <Card.Header className="flex items-start justify-between gap-4">
          <div className="flex flex-col">
            <h2 className="text-xl font-semibold">{t("web-ui:organization.childOrgs.title")}</h2>
            <p className="text-sm text-default-500">
              {t("web-ui:organization.childOrgs.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Chip variant="soft" color="accent">
              {activeOrganizationRole}
            </Chip>
            <Button variant="primary" onPress={() => setIsCreateOpen(true)}>
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t("web-ui:organization.childOrgs.createButton")}
              </span>
            </Button>
          </div>
        </Card.Header>
        <Card.Content className="grid gap-3">
          {childOrganizations.length === 0 ? (
            <p className="text-sm text-default-500">{t("web-ui:organization.childOrgs.empty")}</p>
          ) : (
            <Table aria-label={t("web-ui:organization.childOrgs.title")}>
              <Table.Header>
                <Table.Column>{t("web-ui:organization.childOrgs.column.name")}</Table.Column>
                <Table.Column>{t("web-ui:organization.childOrgs.column.slug")}</Table.Column>
                <Table.Column>{t("web-ui:organization.childOrgs.column.createdAt")}</Table.Column>
                <Table.Column>{t("web-ui:organization.childOrgs.column.actions")}</Table.Column>
              </Table.Header>
              <Table.Body>
                {childOrganizations.map((org) => (
                  <Table.Row key={org.id}>
                    <Table.Cell className="font-medium">{org.name}</Table.Cell>
                    <Table.Cell className="text-default-500">{org.slug ?? "-"}</Table.Cell>
                    <Table.Cell className="text-default-500">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          isPending={switchingOrganizationId === org.id}
                          isDisabled={switchingOrganizationId !== null}
                          onPress={() => void onSwitchToChild(org.id)}
                        >
                          <span className="inline-flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4" />
                            {t("web-ui:organization.childOrgs.switchButton")}
                          </span>
                        </Button>
                        <Button size="sm" variant="secondary" onPress={() => onOpenEdit(org)}>
                          <span className="inline-flex items-center gap-2">
                            <Settings2 className="h-4 w-4" />
                            {t("web-ui:organization.childOrgs.editButton")}
                          </span>
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Card.Content>
      </Card>

      <Modal isOpen={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading className="text-lg font-semibold">
                  {t("web-ui:organization.childOrgs.createTitle")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor={createNameInputId} className="text-sm font-medium">
                    {t("web-ui:organization.childOrgs.createNameLabel")}
                  </Label>
                  <Input
                    id={createNameInputId}
                    value={newOrganizationName}
                    placeholder={t("web-ui:organization.childOrgs.createNamePlaceholder")}
                    onChange={(e) => setNewOrganizationName(e.target.value)}
                    variant="secondary"
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => setIsCreateOpen(false)}>
                  {t("web-ui:common.cancel")}
                </Button>
                <Button variant="primary" isPending={isCreating} onPress={onSubmitCreate}>
                  {t("web-ui:organization.childOrgs.createSubmit")}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal isOpen={isEditOpen} onOpenChange={setIsEditOpen}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading className="text-lg font-semibold">
                  {t("web-ui:organization.childOrgs.editTitle")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor={editNameInputId} className="text-sm font-medium">
                    {t("web-ui:organization.childOrgs.form.name")}
                  </Label>
                  <Input
                    id={editNameInputId}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    variant="secondary"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={editSlugInputId} className="text-sm font-medium">
                    {t("web-ui:organization.childOrgs.form.slug")}
                  </Label>
                  <Input
                    id={editSlugInputId}
                    value={editingSlug}
                    onChange={(e) => setEditingSlug(e.target.value)}
                    variant="secondary"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={editMetadataInputId} className="text-sm font-medium">
                    {t("web-ui:organization.childOrgs.form.metadata")}
                  </Label>
                  <TextArea
                    id={editMetadataInputId}
                    value={editingMetadata}
                    onChange={(e) => setEditingMetadata(e.target.value)}
                    variant="secondary"
                    rows={6}
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onPress={() => setIsEditOpen(false)}>
                  {t("web-ui:common.cancel")}
                </Button>
                <Button variant="primary" isPending={isUpdating} onPress={onSubmitEdit}>
                  {t("web-ui:organization.childOrgs.saveButton")}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
