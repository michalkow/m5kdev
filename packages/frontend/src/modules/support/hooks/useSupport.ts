import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import { useRef, useState } from "react";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useServerEventHandler } from "../../app/hooks/useServerEventHandler";
import { useSession } from "../../auth/hooks/useSession";

export function useSupport(admin = false) {
  const [filters, setFilters] = useQueryStates({
    q: parseAsString.withDefault(""),
    status: parseAsString.withDefault(""),
    priority: parseAsString.withDefault(""),
    waitingOn: parseAsString.withDefault(""),
    assignee: parseAsString.withDefault(""),
  });
  const session = useSession();
  const trpc = useAppTRPC<SupportAppRouter>();
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [beforeSequence, setBeforeSequence] = useState<number | undefined>();
  const selectCase = (id: string | null) => {
    setSelectedId(id);
    setBeforeSequence(undefined);
  };
  const pendingRequest = useRef<{ key: string; id: string } | null>(null);
  const cases = useQuery(
    trpc.support.listCases.queryOptions(
      {
        limit: 30,
        ...(admin
          ? {
              search: filters.q || undefined,
              status:
                filters.status === "open" || filters.status === "resolved"
                  ? filters.status
                  : undefined,
              priority: ["low", "normal", "high", "urgent"].includes(filters.priority)
                ? (filters.priority as "low" | "normal" | "high" | "urgent")
                : undefined,
              waitingOn: ["support", "user", "external"].includes(filters.waitingOn)
                ? (filters.waitingOn as "support" | "user" | "external")
                : undefined,
              assignedUserId:
                filters.assignee === "unassigned" ? null : filters.assignee || undefined,
            }
          : {}),
      },
      { refetchInterval: 5000 }
    )
  );
  const transcript = useQuery(
    trpc.support.getCase.queryOptions(
      { id: selectedId ?? "", beforeSequence, limit: 50 },
      { enabled: selectedId !== null, refetchInterval: 5000 }
    )
  );
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries(trpc.support.listCases.queryFilter()),
      cache.invalidateQueries(trpc.support.getCase.queryFilter()),
    ]);
  };
  useServerEventHandler({
    resource: "support.case",
    handler: () => {
      void refresh();
    },
  });
  const read = useMutation(trpc.support.markRead.mutationOptions({ onSuccess: refresh }));
  const markRead = async () => {
    const last = transcript.data?.messages.at(-1);
    if (!selectedId || !last) return;
    await read.mutateAsync({ id: selectedId, throughSequence: last.sequence });
  };
  const catalog = useQuery(trpc.support.getCatalog.queryOptions({}, { enabled: admin }));
  const update = useMutation(trpc.support.updateCase.mutationOptions({ onSuccess: refresh }));
  const save = useMutation(
    trpc.support.saveCatalog.mutationOptions({
      onSuccess: () => cache.invalidateQueries(trpc.support.getCatalog.queryFilter()),
    })
  );
  const tag = useMutation(trpc.support.setTags.mutationOptions({ onSuccess: refresh }));
  const updateCase = async (
    patch: Omit<Parameters<typeof update.mutateAsync>[0], "id" | "expectedVersion">
  ) => {
    if (!transcript.data) return;
    await update.mutateAsync({
      id: transcript.data.case.id,
      expectedVersion: transcript.data.case.version,
      ...patch,
    });
  };
  const create = useMutation(
    trpc.support.createCase.mutationOptions({
      onSuccess: async (value) => {
        pendingRequest.current = null;
        selectCase(value.id);
        await refresh();
      },
    })
  );
  const send = useMutation(
    trpc.support.sendMessage.mutationOptions({
      onSuccess: async () => {
        pendingRequest.current = null;
        setBeforeSequence(undefined);
        await refresh();
      },
    })
  );
  const clientId = (key: string) => {
    if (pendingRequest.current?.key !== key)
      pendingRequest.current = { key, id: crypto.randomUUID() };
    return pendingRequest.current.id;
  };
  const createCase = async (subject: string, body: string, userId?: string) => {
    try {
      await create.mutateAsync({
        subject,
        body,
        userId,
        clientId: clientId(JSON.stringify([subject, body, userId])),
      });
      return true;
    } catch {
      return false;
    }
  };
  const sendMessage = async (body: string, visibility: "public" | "internal" = "public") => {
    if (!selectedId) return false;
    try {
      await send.mutateAsync({
        id: selectedId,
        body,
        visibility,
        clientId: clientId(JSON.stringify([selectedId, body, visibility])),
      });
      return true;
    } catch {
      return false;
    }
  };
  return {
    currentUserId: session.data?.user.id,
    filters,
    setFilters,
    catalog: catalog.data,
    updateCase,
    saveCatalog: save.mutateAsync,
    setTags: async (tagIds: string[]) => {
      if (transcript.data)
        await tag.mutateAsync({
          id: transcript.data.case.id,
          expectedVersion: transcript.data.case.version,
          tagIds,
        });
    },
    cases: cases.data ?? [],
    transcript: transcript.data,
    selectedId,
    selectCase,
    createCase,
    sendMessage,
    showOlder: () => setBeforeSequence(transcript.data?.messages[0]?.sequence),
    showLatest: () => setBeforeSequence(undefined),
    isHistory: beforeSequence !== undefined,
    retry: refresh,
    markRead,
    isLoading: cases.isLoading || (selectedId !== null && transcript.isLoading),
    isPending: create.isPending || send.isPending,
    error:
      update.error?.message ??
      save.error?.message ??
      tag.error?.message ??
      catalog.error?.message ??
      read.error?.message ??
      cases.error?.message ??
      transcript.error?.message ??
      create.error?.message ??
      send.error?.message,
  };
}
