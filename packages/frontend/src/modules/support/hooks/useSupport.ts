import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import { supportStageDocumentationSchema } from "@m5kdev/commons/modules/support/support.schema";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppTRPC } from "../../app/hooks/useAppTrpc";
import { useServerEventHandler } from "../../app/hooks/useServerEventHandler";
import { useSession } from "../../auth/hooks/useSession";

export function useSupport(admin = false) {
  const [filters, setFilters] = useQueryStates({
    supportSince: parseAsString.withDefault(""),
    q: parseAsString.withDefault(""),
    status: parseAsString.withDefault(""),
    priority: parseAsString.withDefault(""),
    waitingOn: parseAsString.withDefault(""),
    assignee: parseAsString.withDefault(""),
  });
  const { i18n } = useTranslation();
  const session = useSession();
  const trpc = useAppTRPC<SupportAppRouter>();
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [beforeSequence, setBeforeSequence] = useState<number | undefined>();
  const currentSelection = useRef<string | null>(null);
  const selectCase = (id: string | null) => {
    currentSelection.current = id;
    setSelectedId(id);
    setAttachmentIds([]);
    setBeforeSequence(undefined);
  };

  const cases = useInfiniteQuery(
    trpc.support.listCases.infiniteQueryOptions(
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
      { refetchInterval: 5000, getNextPageParam: (last) => last.cursor ?? undefined }
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
      cache.invalidateQueries(trpc.support.listCases.infiniteQueryFilter()),
      cache.invalidateQueries(trpc.support.getCase.queryFilter()),
      cache.invalidateQueries(trpc.support.getUnreadCount.queryFilter()),
    ]);
  };
  useServerEventHandler({
    resource: "support.case",
    handler: () => {
      void refresh();
    },
  });
  const read = useMutation(trpc.support.markRead.mutationOptions({ onSuccess: refresh }));
  const markRead = () => {
    const page = transcript.data;
    const last = page?.messages.at(-1);
    if (!selectedId || !page || !last) return;
    read.mutate({
      id: selectedId,
      throughSequence: last.sequence,
      messageIds: page.messages
        .filter((message) => message.publishedAt)
        .map((message) => message.id),
    });
  };
  const availability = useQuery(
    trpc.support.getAvailability.queryOptions({}, { staleTime: 60000 })
  );
  const overview = useQuery(
    trpc.support.overview.queryOptions(
      {
        since:
          filters.supportSince && Number.isFinite(Date.parse(filters.supportSince))
            ? new Date(filters.supportSince)
            : undefined,
      },
      { enabled: admin, staleTime: 60000, refetchInterval: 60000 }
    )
  );
  const feedback = useMutation(
    trpc.support.rate.mutationOptions({
      onSuccess: async () => {
        await refresh();
        await cache.invalidateQueries(trpc.support.overview.queryFilter());
      },
    })
  );
  const documentation = useQuery(
    trpc.support.getDocumentation.queryOptions({}, { enabled: admin })
  );
  const stageDocs = useMutation(
    trpc.support.stageDocumentation.mutationOptions({
      onSuccess: () => cache.invalidateQueries(trpc.support.getDocumentation.queryFilter()),
    })
  );
  const withdrawDocs = useMutation(
    trpc.support.withdrawDocumentation.mutationOptions({
      onSuccess: () => cache.invalidateQueries(trpc.support.getDocumentation.queryFilter()),
    })
  );
  const human = useMutation(trpc.support.requestHuman.mutationOptions({ onSuccess: refresh }));
  const settings = useQuery(trpc.support.getSettings.queryOptions({}, { enabled: admin }));
  const settingsSave = useMutation(
    trpc.support.saveSettings.mutationOptions({
      onSuccess: () => cache.invalidateQueries(trpc.support.getSettings.queryFilter()),
    })
  );
  const working = useMutation(
    trpc.support.setWorkingLocale.mutationOptions({
      onSuccess: () => cache.invalidateQueries(trpc.support.getSettings.queryFilter()),
    })
  );
  const language = useMutation(trpc.support.setLanguage.mutationOptions({ onSuccess: refresh }));
  const translate = useMutation(
    trpc.support.requestTranslation.mutationOptions({ onSuccess: refresh })
  );
  const publication = useMutation(
    trpc.support.controlMessage.mutationOptions({ onSuccess: refresh })
  );
  const catalog = useQuery(trpc.support.getCatalog.queryOptions({}, { enabled: admin }));
  const update = useMutation(trpc.support.updateCase.mutationOptions({ onSuccess: refresh }));
  const save = useMutation(
    trpc.support.saveCatalog.mutationOptions({
      onSuccess: () => cache.invalidateQueries(trpc.support.getCatalog.queryFilter()),
    })
  );
  const tag = useMutation(trpc.support.setTags.mutationOptions({ onSuccess: refresh }));
  const updateCase = (
    patch: Omit<Parameters<typeof update.mutateAsync>[0], "id" | "expectedVersion">
  ) => {
    if (!transcript.data) return;
    update.mutate({
      id: transcript.data.case.id,
      expectedVersion: transcript.data.case.version,
      ...patch,
    });
  };
  const create = useMutation(
    trpc.support.createCase.mutationOptions({
      onSuccess: async (value) => {
        selectCase(value.id);
        await refresh();
      },
    })
  );
  const send = useMutation(
    trpc.support.sendMessage.mutationOptions({
      onSuccess: async (_value, input) => {
        if (currentSelection.current === input.id) {
          setBeforeSequence(undefined);
          setAttachmentIds((previous) =>
            previous.filter((id) => !input.attachmentIds?.includes(id))
          );
        }
        await refresh();
      },
    })
  );

  const upload = useMutation(trpc.support.initiateAttachment.mutationOptions());
  const download = useMutation(trpc.support.downloadAttachment.mutationOptions());
  const redact = useMutation(trpc.support.redactMessage.mutationOptions({ onSuccess: refresh }));
  const uploadFiles = async (files: File[]) => {
    if (!selectedId) return;
    const uploadCaseId = selectedId;
    setUploadError(null);
    setIsUploading(true);
    try {
      const ids: string[] = [];
      for (const file of files) {
        const result = await upload.mutateAsync({
          id: uploadCaseId,
          originalName: file.name,
          contentType: (file.type || "text/plain") as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "application/pdf"
            | "text/plain",
          sizeBytes: file.size,
        });
        const response = await fetch(result.url, {
          method: "PUT",
          headers: { "content-type": file.type || "text/plain" },
          body: file,
        });
        if (!response.ok) throw new Error("Upload failed");
        ids.push(result.fileId);
      }
      if (currentSelection.current === uploadCaseId)
        setAttachmentIds((previous) => [...previous, ...ids]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };
  const downloadFile = async (fileId: string) => {
    if (!selectedId) return;
    download.mutate(
      { id: selectedId, fileId },
      { onSuccess: (result) => window.open(result.url, "_blank", "noopener,noreferrer") }
    );
  };
  const redactMessage = async (messageId: string, reason: string) => {
    if (selectedId) redact.mutate({ id: selectedId, messageId, reason });
  };
  type Request =
    | { kind: "create"; input: Parameters<typeof create.mutateAsync>[0] }
    | { kind: "send"; input: Parameters<typeof send.mutateAsync>[0] };
  const pendingRequests = useRef(new Map<string, Request>());
  const lastFailed = useRef<string | null>(null);
  const runRequest = async (key: string, request: Request) => {
    const retained = pendingRequests.current.get(key) ?? request;
    pendingRequests.current.set(key, retained);
    try {
      if (retained.kind === "create") await create.mutateAsync(retained.input);
      else await send.mutateAsync(retained.input);
      pendingRequests.current.delete(key);
      if (lastFailed.current === key)
        lastFailed.current = [...pendingRequests.current.keys()].at(-1) ?? null;
      return true;
    } catch {
      lastFailed.current = key;
      return false;
    }
  };
  const createCase = (subject: string, body: string, userId?: string) => {
    const input = { subject, body, userId, uiLocale: i18n.resolvedLanguage ?? i18n.language };
    return runRequest(JSON.stringify(["create", input]), {
      kind: "create",
      input: { ...input, clientId: crypto.randomUUID() },
    });
  };
  const sendMessage = async (
    body: string,
    visibility: "public" | "internal" = "public",
    preview = false
  ) => {
    if (!selectedId) return false;
    const locale = admin
      ? settings.data?.workingLocale
      : (transcript.data?.case.supportLocale ??
        transcript.data?.case.detectedLocale ??
        transcript.data?.case.uiLocale);
    const input = { id: selectedId, body, visibility, attachmentIds, preview, locale };
    return runRequest(JSON.stringify(["send", input]), {
      kind: "send",
      input: { ...input, clientId: crypto.randomUUID() },
    });
  };
  const retry = async () => {
    const key = lastFailed.current;
    const request = key ? pendingRequests.current.get(key) : undefined;
    if (key && request) await runRequest(key, request);
    await Promise.all([
      refresh(),
      ...[availability, overview, documentation, settings, catalog]
        .filter((query) => query.isError)
        .map((query) => query.refetch()),
    ]);
  };
  return {
    availability: availability.data,
    overview: overview.data,
    rate: (score: number) => {
      if (transcript.data)
        feedback.mutate({
          id: transcript.data.case.id,
          cycle: transcript.data.feedback.cycle,
          score,
        });
    },
    isRating: feedback.isPending,
    documentation: documentation.data,
    stageDocumentation: async (file: File) => {
      try {
        if (file.size > 5 * 1024 * 1024) throw new Error("Manifest exceeds limit");
        await stageDocs.mutateAsync(
          supportStageDocumentationSchema.parse({ manifest: JSON.parse(await file.text()) })
        );
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Manifest failed");
      }
    },
    withdrawDocumentation: withdrawDocs.mutate,
    requestHuman: () => {
      if (selectedId) human.mutate({ id: selectedId });
    },
    settings: settings.data,
    saveSettings: settingsSave.mutateAsync,
    setWorkingLocale: working.mutate,
    setLanguage: (locale: string | null) => {
      if (selectedId) language.mutate({ id: selectedId, locale });
    },
    translateMessage: (messageId: string) => {
      if (selectedId && settings.data)
        translate.mutate({ id: selectedId, messageId, locale: settings.data.workingLocale });
    },
    controlMessage: (messageId: string, action: "retry" | "send-original" | "publish-preview") => {
      if (selectedId) publication.mutate({ id: selectedId, messageId, action });
    },
    attachmentIds,
    uploadFiles,
    downloadFile,
    redactMessage,
    isUploading,
    currentUserId: session.data?.user.id,
    filters,
    setFilters,
    catalog: catalog.data,
    updateCase,
    saveCatalog: save.mutateAsync,
    setTags: (tagIds: string[]) => {
      if (transcript.data)
        tag.mutate({
          id: transcript.data.case.id,
          expectedVersion: transcript.data.case.version,
          tagIds,
        });
    },
    cases: cases.isError ? [] : (cases.data?.pages.flatMap((page) => page.items) ?? []),
    hasMoreCases: cases.hasNextPage,
    loadMoreCases: () => {
      void cases.fetchNextPage();
    },
    transcript: transcript.isError ? undefined : transcript.data,
    selectedId,
    selectCase,
    createCase,
    sendMessage,
    showOlder: () => setBeforeSequence(transcript.data?.messages[0]?.sequence),
    showLatest: () => setBeforeSequence(undefined),
    isHistory: beforeSequence !== undefined,
    retry,
    markRead,
    isSettingsLoading: admin && settings.isLoading,
    settingsError: settings.error?.message,
    isDocumentationLoading: admin && documentation.isLoading,
    documentationError: documentation.error?.message,
    isLoading:
      cases.isLoading ||
      (selectedId !== null && transcript.isLoading) ||
      (admin && (settings.isLoading || documentation.isLoading)),
    isPending: create.isPending || send.isPending || isUploading,
    error:
      settings.error?.message ??
      documentation.error?.message ??
      availability.error?.message ??
      overview.error?.message ??
      feedback.error?.message ??
      stageDocs.error?.message ??
      withdrawDocs.error?.message ??
      human.error?.message ??
      settingsSave.error?.message ??
      working.error?.message ??
      language.error?.message ??
      translate.error?.message ??
      publication.error?.message ??
      uploadError ??
      download.error?.message ??
      redact.error?.message ??
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
