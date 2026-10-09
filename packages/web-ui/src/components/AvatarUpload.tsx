import { Avatar, ProgressBar } from "@heroui/react";
import { useAppConfig } from "@m5kdev/frontend/modules/app/hooks/useAppConfig";
import { fileDisplayUrl } from "@m5kdev/frontend/modules/file/hooks/useS3DownloadUrl";
import {
  type FileUploadScope,
  useS3Upload,
} from "@m5kdev/frontend/modules/file/hooks/useS3Upload";
import { Edit2, User } from "lucide-react";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { CropDialog } from "./CropDialog";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onUploadComplete?: (fileId: string) => void;
  className?: string;
  scope?: FileUploadScope;
}

export function AvatarUpload({
  currentAvatarUrl,
  onUploadComplete,
  className,
  scope = "organization",
}: AvatarUploadProps) {
  const { t } = useTranslation();
  const { serverUrl } = useAppConfig();
  const [isHovered, setIsHovered] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCropDialog, setShowCropDialog] = useState(false);

  const storedAvatarUrl = fileDisplayUrl(serverUrl, currentAvatarUrl);
  const displayUrl = previewUrl ?? storedAvatarUrl;

  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, status, progress, error, reset } = useS3Upload({ scope });

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.type)) {
        alert(t("web-ui:upload.errors.invalidType"));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert(t("web-ui:upload.errors.tooLarge"));
        return;
      }
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setShowCropDialog(true);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    const croppedFile = new File([croppedBlob], selectedFile?.name || "cropped-image.jpg", {
      type: "image/jpeg",
    });

    setSelectedFile(croppedFile);
    const croppedObjectUrl = URL.createObjectURL(croppedFile);
    setPreviewUrl(croppedObjectUrl);
    setShowCropDialog(false);

    try {
      const uploadedFileId = await upload(croppedFile);
      onUploadComplete?.(uploadedFileId);
    } catch (uploadError) {
      console.error("Error uploading image:", uploadError);
    }
  };

  const removeFile = () => {
    if (previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setShowCropDialog(false);
    reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <div className={cn("relative inline-block", className)}>
        <label
          htmlFor={inputId}
          className="inline-block"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Avatar color="accent" variant="soft" className="relative size-24 cursor-pointer">
            {displayUrl ? (
              <Avatar.Image
                src={displayUrl}
                alt={t("web-ui:avatar.preview.alt")}
                crossOrigin="use-credentials"
              />
            ) : (
              <Avatar.Fallback>
                <User className="h-12 w-12" />
              </Avatar.Fallback>
            )}
            {isHovered && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
                <Edit2 className="h-6 w-6 text-white" />
              </div>
            )}
          </Avatar>
        </label>

        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
        />

        {status === "uploading" && (
          <div className="mt-2 w-full">
            <ProgressBar
              aria-label={t("web-ui:upload.progress.ariaLabel")}
              className="w-full"
              value={progress}
            >
              <ProgressBar.Track className="h-2">
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          </div>
        )}
        {status === "error" && error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
      </div>

      {displayUrl && showCropDialog ? (
        <CropDialog
          open={showCropDialog}
          onOpenChange={setShowCropDialog}
          imageUrl={previewUrl ?? displayUrl}
          onCropComplete={handleCropComplete}
          onCancel={removeFile}
          isLoading={status === "uploading"}
        />
      ) : null}
    </>
  );
}
