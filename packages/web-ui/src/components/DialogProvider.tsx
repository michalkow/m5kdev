import {
  Button,
  type ButtonProps,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { semanticColors } from "@heroui/theme";
import { createContext, useContext, useRef, useState } from "react";

export type DialogProps = {
  title: React.ReactNode;
  description: React.ReactNode;
  color?: ButtonProps["color"];
  cancelable?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
};

const DialogContext = createContext<(dialog: DialogProps) => void>(() => {
  console.warn("DialogProvider is not initialized");
});

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return context;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogProps | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSetDialog = (dialog: DialogProps) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setDialog(dialog);
    setIsOpen(true);
  };

  const handleUnsetDialog = () => {
    setIsOpen(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    timeoutRef.current = setTimeout(() => {
      setDialog(null);
    }, 500);
  };

  const handleCancel = () => {
    dialog?.onCancel?.();
    handleUnsetDialog();
  };

  const handleConfirm = () => {
    dialog?.onConfirm?.();
    handleUnsetDialog();
  };

  return (
    <DialogContext.Provider value={handleSetDialog}>
      <>
        {children}
        {dialog && (
          <Modal
            isOpen={isOpen}
            onOpenChange={handleUnsetDialog}
            style={{
              borderColor: semanticColors.light[dialog.color || "danger"][600],
            }}
            classNames={{
              base: "border-1",
            }}
          >
            <ModalContent>
              <ModalHeader>{dialog.title}</ModalHeader>
              <ModalBody>{dialog.description}</ModalBody>
              <ModalFooter>
                <div className="flex flex-row gap-2">
                  {(dialog.cancelable || dialog.onCancel) && (
                    <Button onPress={handleCancel}>{dialog.cancelLabel ?? "Cancel"}</Button>
                  )}
                  <Button color={dialog.color} onPress={handleConfirm}>
                    {dialog.confirmLabel ?? "Confirm"}
                  </Button>
                </div>
              </ModalFooter>
            </ModalContent>
          </Modal>
        )}
      </>
    </DialogContext.Provider>
  );
}
