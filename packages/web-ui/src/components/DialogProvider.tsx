import { Button, type ButtonRootProps, Modal } from "@heroui/react";
import { createContext, useContext, useRef, useState } from "react";

export type DialogProps = {
  title: React.ReactNode;
  description: React.ReactNode;
  /** Maps to button variant for the confirm action and modal border emphasis. */
  intent?: "danger" | "primary" | "warning";
  cancelable?: boolean;
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
};

const DialogContext = createContext<(dialog: DialogProps) => void>(() => {
  console.warn("DialogProvider is not initialized");
});

const intentBorderClass: Record<NonNullable<DialogProps["intent"]>, string> = {
  danger: "border-danger",
  primary: "border-primary",
  warning: "border-warning",
};

const intentButtonVariant: Record<
  NonNullable<DialogProps["intent"]>,
  ButtonRootProps["variant"]
> = {
  danger: "danger",
  primary: "primary",
  warning: "secondary",
};

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

  const handleSetDialog = (next: DialogProps) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setDialog(next);
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

  const intent = dialog?.intent ?? "danger";

  return (
    <DialogContext.Provider value={handleSetDialog}>
      {children}
      {dialog && (
        <Modal isOpen={isOpen} onOpenChange={(open) => !open && handleUnsetDialog()}>
          <Modal.Backdrop />
          <Modal.Container className={`border ${intentBorderClass[intent]}`}>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>{dialog.title}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>{dialog.description}</Modal.Body>
              <Modal.Footer>
                <div className="flex flex-row gap-2">
                  {(dialog.cancelable || dialog.onCancel) && (
                    <Button variant="tertiary" onPress={handleCancel}>
                      {dialog.cancelLabel ?? "Cancel"}
                    </Button>
                  )}
                  <Button variant={intentButtonVariant[intent]} onPress={handleConfirm}>
                    {dialog.confirmLabel ?? "Confirm"}
                  </Button>
                </div>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal>
      )}
    </DialogContext.Provider>
  );
}
