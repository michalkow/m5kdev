import { type DialogProps, useDialog } from "../components/DialogProvider";

export { useDialog };

export const useConfirmDialog = () => {
  const dialog = useDialog();
  return (props: DialogProps) => {
    dialog({
      intent: "danger",
      cancelable: true,
      ...props,
    });
  };
};

export const useAlertDialog = () => {
  const dialog = useDialog();
  return (props: DialogProps) => {
    dialog({
      intent: "warning",
      cancelable: false,
      ...props,
    });
  };
};
