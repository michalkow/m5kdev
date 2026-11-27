import type { SupportAppRouter } from "@m5kdev/backend/modules/support/support.trpc";
import { supportStageDocumentationSchema } from "@m5kdev/commons/modules/support/support.schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { i18n } = useTranslation();
  const session = useSession();
  const trpc = useAppTRPC<SupportAppRouter>();
  const cache = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [beforeSequence, setBeforeSequence] = useState<number | undefined>();
  const selectCase = (id: string | null) => {
    setSelectedId(id);
    setAttachmentIds([]);
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
        setAttachmentIds([]);
        await refresh();
      },
    })
  );

  const upload = useMutation(trpc.support.initiateAttachment.mutationOptions());
  const download = useMutation(trpc.support.downloadAttachment.mutationOptions());
  const redact = useMutation(trpc.support.redactMessage.mutationOptions({ onSuccess: refresh }));
  const uploadFiles = async (files: File[]) => {
    if (!selectedId) return;
    setUploadError(null);
    setIsUploading(true);
    try {
      const ids: string[] = [];
      for (const file of files) {
        const result = await upload.mutateAsync({
          id: selectedId,
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
      setAttachmentIds((previous) => [...previous, ...ids]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };
  const downloadFile = async (fileId: string) => {
    if (!selectedId) return;
    const result = await download.mutateAsync({ id: selectedId, fileId });
    window.open(result.url, "_blank", "noopener,noreferrer");
  };
  const redactMessage = async (messageId: string, reason: string) => {
    if (selectedId) await redact.mutateAsync({ id: selectedId, messageId, reason });
  };
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
        uiLocale: i18n.resolvedLanguage ?? i18n.language,
        userId,
        clientId: clientId(JSON.stringify([subject, body, userId])),
      });
      return true;
    } catch {
      return false;
    }
  };
  const sendMessage = async (
    body: string,
    visibility: "public" | "internal" = "public",
    preview = false
  ) => {
    if (!selectedId) return false;
    try {
      await send.mutateAsync({
        id: selectedId,
        body,
        visibility,
        attachmentIds,
        preview,
        clientId: clientId(JSON.stringify([selectedId, body, visibility, attachmentIds])),
      });
      return true;
    } catch {
      return false;
    }
  };
  return {
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
    isPending: create.isPending || send.isPending || isUploading,
    error:
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
