import { Avatar, ProgressBar } from "@heroui/react";
import { useFileUpload } from "@m5kdev/frontend/modules/file/hooks/useUpload";
import { Edit2, User } from "lucide-react";
import { type ChangeEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { CropDialog } from "./CropDialog";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  onUploadComplete?: (avatarUrl: string) => void;
  className?: string;
}

export function AvatarUpload({ currentAvatarUrl, onUploadComplete, className }: AvatarUploadProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl || null);
  const [showCropDialog, setShowCropDialog] = useState(false);

  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, status, progress, errorMessage, reset } = useFileUpload();

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.type)) {
        alert(t("web-ui:upload.errors.invalidType"));
        return;
      }
      // Validate file size (5MB)
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
      const res = await upload<{
        url: string;
        minetype: string;
        size: number;
      }>("image", croppedFile);
      onUploadComplete?.(res.url);
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  };

  const removeFile = () => {
    if (previewUrl && previewUrl !== currentAvatarUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(currentAvatarUrl || null);
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
            {previewUrl ? (
              <Avatar.Image src={previewUrl} alt={t("web-ui:avatar.preview.alt")} />
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
        {status === "error" && <p className="mt-2 text-sm text-red-500">{errorMessage}</p>}
      </div>

      {previewUrl && (
        <CropDialog
          open={showCropDialog}
          onOpenChange={setShowCropDialog}
          imageUrl={previewUrl}
          onCropComplete={handleCropComplete}
          onCancel={removeFile}
          isLoading={status === "uploading"}
        />
      )}
    </>
  );
}
