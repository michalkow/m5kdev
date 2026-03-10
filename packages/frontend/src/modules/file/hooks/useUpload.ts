import { useCallback, useState } from "react";

export type UploadStatus = "pending" | "uploading" | "completed" | "error";

export interface UploadFileTask {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  errorMessage?: string;
  bytesUploaded: number;
  totalBytes: number;
}

interface UploadCallbacks {
  onProgress: (progress: number, bytesUploaded: number) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

// Shared utility function to create upload promise
const createUploadPromise = <T>(
  type: string,
  file: File,
  callbacks: UploadCallbacks
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event: ProgressEvent<EventTarget>) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded * 100) / event.total);
        callbacks.onProgress(progress, event.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        callbacks.onComplete();
        // if response has json header, parse it
        if (xhr.getResponseHeader("Content-Type")?.includes("application/json")) {
          resolve(JSON.parse(xhr.response) as T);
        } else {
          resolve(xhr.response as T);
        }
      } else {
        const errorMessage = `Upload failed with status ${xhr.status}`;
        callbacks.onError(errorMessage);
        reject(new Error(errorMessage));
      }
    };

    xhr.onerror = () => {
      const errorMessage = "Network error during upload";
      callbacks.onError(errorMessage);
      reject(new Error(errorMessage));
    };

    xhr.open("POST", `${import.meta.env.VITE_SERVER_URL}/upload/file/${type}`);
    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
};

// Shared utility to create a task
const createUploadTask = (file: File): UploadFileTask => ({
  id:
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substr(2, 9),
  file,
  progress: 0,
  status: "pending",
  bytesUploaded: 0,
  totalBytes: file.size,
});

// Hook for single file upload
export function useFileUpload() {
  const [uploadTask, setUploadTask] = useState<UploadFileTask | null>(null);

  const upload = useCallback(async <T>(type: string, file: File): Promise<T> => {
    const task = createUploadTask(file);
    setUploadTask(task);

    const callbacks: UploadCallbacks = {
      onProgress: (progress, bytesUploaded) => {
        setUploadTask((prev) =>
          prev
            ? {
                ...prev,
                progress,
                bytesUploaded,
                status: "uploading",
              }
            : null
        );
      },
      onComplete: () => {
        setUploadTask((prev) => (prev ? { ...prev, status: "completed", progress: 100 } : null));
      },
      onError: (errorMessage) => {
        setUploadTask((prev) =>
          prev
            ? {
                ...prev,
                status: "error",
                errorMessage,
                progress: 0,
              }
            : null
        );
      },
    };

    return createUploadPromise<T>(type, file, callbacks);
  }, []);

  const reset = useCallback(() => {
    setUploadTask(null);
  }, []);

  return {
    ...uploadTask,
    upload,
    reset,
  };
}

// Hook for multiple file uploads
export function useMultipartUpload() {
  const [uploadQueue, setUploadQueue] = useState<UploadFileTask[]>([]);
  const [overallProgress, setOverallProgress] = useState<number>(0);

  const updateTask = useCallback((id: string, changes: Partial<UploadFileTask>) => {
    setUploadQueue((prev) => prev.map((task) => (task.id === id ? { ...task, ...changes } : task)));
  }, []);

  const updateOverallProgress = useCallback((queue: UploadFileTask[]) => {
    if (queue.length === 0) {
      setOverallProgress(100);
      return;
    }
    const totalBytes = queue.reduce((sum, task) => sum + task.file.size, 0);
    const uploadedBytes = queue.reduce((sum, task) => {
      if (task.status === "completed") {
        return sum + task.file.size;
      }
      if (task.status === "uploading") {
        return sum + (task.progress / 100) * task.file.size;
      }
      return sum;
    }, 0);
    setOverallProgress(Math.floor((uploadedBytes / totalBytes) * 100));
  }, []);

  const uploadSingleFile = useCallback(
    async <T>(type: string, task: UploadFileTask): Promise<T> => {
      const callbacks: UploadCallbacks = {
        onProgress: (progress, bytesUploaded) => {
          updateTask(task.id, {
            progress,
            bytesUploaded,
            status: "uploading",
          });
          setUploadQueue((currentQueue) => {
            const updatedQueue = currentQueue.map((q) =>
              q.id === task.id ? { ...q, progress, bytesUploaded } : q
            );
            updateOverallProgress(updatedQueue);
            return updatedQueue;
          });
        },
        onComplete: () => {
          updateTask(task.id, { status: "completed", progress: 100 });
        },
        onError: (errorMessage) => {
          updateTask(task.id, {
            status: "error",
            errorMessage,
            progress: 0,
          });
        },
      };

      return createUploadPromise<T>(type, task.file, callbacks);
    },
    [updateTask, updateOverallProgress]
  );

  const uploadFiles = useCallback(
    async (type: string, files: File[]) => {
      const initialQueue = files.map(createUploadTask);
      setUploadQueue(initialQueue);
      updateOverallProgress(initialQueue);

      for (const task of initialQueue) {
        try {
          await uploadSingleFile(type, task);
        } catch (_error) {}
      }
    },
    [uploadSingleFile, updateOverallProgress]
  );

  const reset = useCallback(() => {
    setUploadQueue([]);
    setOverallProgress(0);
  }, []);

  return {
    uploadQueue,
    overallProgress,
    uploadFiles,
    reset,
    getTotalBytes: () => uploadQueue.reduce((sum, task) => sum + task.totalBytes, 0),
    getTotalBytesUploaded: () => uploadQueue.reduce((sum, task) => sum + task.bytesUploaded, 0),
  };
}
