import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useServerEventHandler } from "../../app/hooks/useServerEventHandler";

export function useSupport() {
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
    trpc.support.listCases.queryOptions({ limit: 30 }, { refetchInterval: 5000 })
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
  const sendMessage = async (body: string) => {
    if (!selectedId) return false;
    try {
      await send.mutateAsync({
        id: selectedId,
        body,
        clientId: clientId(JSON.stringify([selectedId, body])),
      });
      return true;
    } catch {
      return false;
    }
  };
  return {
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
      read.error?.message ??
      cases.error?.message ??
      transcript.error?.message ??
      create.error?.message ??
      send.error?.message,
  };
}
