import { useS3Upload } from "@m5kdev/frontend/modules/file/hooks/useS3Upload";
import { File, Upload, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";

interface FileDropzoneProps {
  onUploadComplete?: (fileId: string) => void;
  className?: string;
}

export function FileDropzone({ onUploadComplete, className }: FileDropzoneProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { upload, progress, status, reset } = useS3Upload({ scope: "organization" });
  const isUploading = status === "uploading";

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0] ?? null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [],
      "image/png": [],
      "image/webp": [],
      "image/jpg": [],
    },
    maxFiles: 1,
  });

  const uploadFile = async () => {
    if (!selectedFile) return;
    try {
      const fileId = await upload(selectedFile);
      onUploadComplete?.(fileId);
      setSelectedFile(null);
      reset();
    } catch (error) {
      console.error("Upload error:", error);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    reset();
  };

  return (
    <div className={cn("w-full max-w-xl", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary",
          selectedFile && "border-primary"
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          {selectedFile ? (
            <>
              <File className="h-8 w-8 text-primary" />
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile();
                  }}
                  className="p-1 hover:bg-gray-100 rounded-full"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-gray-400" />
              <p className="text-sm text-gray-600">Drag & drop an image here, or click to select</p>
              <p className="text-xs text-gray-500">Supports JPG, PNG, and WebP</p>
            </>
          )}
        </div>
      </div>

      {selectedFile && (
        <div className="mt-4 space-y-4">
          {isUploading && <Progress value={progress} className="h-2 w-full" />}
          <Button onClick={uploadFile} disabled={isUploading} className="w-full">
            {isUploading ? "Uploading..." : "Upload File"}
          </Button>
        </div>
      )}
    </div>
  );
}
