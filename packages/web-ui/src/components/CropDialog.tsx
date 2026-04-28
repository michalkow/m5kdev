import { Button, Modal, Slider } from "@heroui/react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { useTranslation } from "react-i18next";

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: CropArea,
  t: (key: string) => string
): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;

  // Create canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error(t("web-ui:image.crop.failedContext"));
  }

  // Set canvas size to the crop size
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Get the cropped image as blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error(t("web-ui:image.crop.failedCrop")));
      else resolve(blob);
    }, "image/jpeg");
  });
}

export function CropDialog({
  open,
  onOpenChange,
  imageUrl,
  onCropComplete,
  onCancel,
  isLoading = false,
}: CropDialogProps) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);

  const handleCropComplete = (_croppedArea: Area, croppedAreaPixels: CropArea) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleSave = async () => {
    if (!croppedAreaPixels) return;

    try {
      const croppedImageBlob = await getCroppedImg(imageUrl, croppedAreaPixels, t);
      onCropComplete(croppedImageBlob);
    } catch (error) {
      console.error(t("web-ui:image.crop.error"), error);
    }
  };

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[600px] h-[600px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{t("web-ui:image.crop.title")}</Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              <div className="relative h-[400px] w-full">
                <Cropper
                  image={imageUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={handleCropComplete}
                  objectFit="contain"
                  showGrid={true}
                  style={{
                    containerStyle: {
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      backgroundColor: "#262626",
                    },
                    cropAreaStyle: {
                      border: "2px solid #fff",
                      color: "rgba(255, 255, 255, 0.9)",
                    },
                    mediaStyle: {
                      backgroundColor: "#262626",
                    },
                  }}
                />
              </div>

              <div className="flex items-center gap-4 px-1 pt-4">
                <ZoomOut className="h-4 w-4" />
                <Slider
                  aria-label={t("web-ui:image.crop.title")}
                  value={zoom}
                  onChange={(value) => setZoom(typeof value === "number" ? value : (value[0] ?? 1))}
                  minValue={1}
                  maxValue={3}
                  step={0.1}
                  className="flex-1"
                >
                  <Slider.Track className="h-2 rounded-full bg-surface-secondary">
                    <Slider.Fill className="bg-accent" />
                    <Slider.Thumb className="size-4 rounded-full bg-accent border-2 border-background" />
                  </Slider.Track>
                </Slider>
                <ZoomIn className="h-4 w-4" />
              </div>
            </Modal.Body>

            <Modal.Footer>
              <div className="flex w-full justify-end gap-2">
                <Button variant="tertiary" onPress={onCancel}>
                  {t("web-ui:common.cancel")}
                </Button>
                <Button
                  variant="primary"
                  onPress={handleSave}
                  isDisabled={isLoading}
                  isPending={isLoading}
                >
                  {isLoading ? t("web-ui:common.saving") : t("web-ui:common.save")}
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
