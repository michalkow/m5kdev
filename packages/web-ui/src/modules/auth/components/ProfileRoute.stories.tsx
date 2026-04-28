import { Button } from "@heroui/react";
import { AppConfigProvider } from "@m5kdev/frontend/modules/app/components/AppConfigProvider";
import type { Meta, StoryObj } from "@storybook/react";
import { type ReactElement, useCallback, useState } from "react";
import { Toaster } from "sonner";

import { CropDialog } from "../../../components/CropDialog";
import { ProfileEditor } from "./ProfileRoute";

interface ProfileEditorStoryProps {
  readonly initialName: string;
  readonly initialImage: string | null;
  readonly simulateError?: boolean;
}

function ProfileEditorStory({
  initialName,
  initialImage,
  simulateError = false,
}: ProfileEditorStoryProps): ReactElement {
  const onSubmit = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (simulateError) throw new Error("Simulated error");
  }, [simulateError]);

  return (
    <div className="bg-background text-foreground">
      <Toaster richColors />
      <AppConfigProvider
        config={{
          appUrl: "http://localhost:6006",
          serverUrl: "http://localhost:3000",
          appName: "Storybook",
        }}
      >
        <ProfileEditor
          initialValues={{ name: initialName, image: initialImage }}
          onSubmit={onSubmit}
        />
      </AppConfigProvider>
    </div>
  );
}

const meta = {
  title: "modules/auth/ProfileRoute",
  component: ProfileEditorStory,
  tags: ["autodocs"],
  args: {
    initialName: "Alex Morgan",
    initialImage: null,
  },
} satisfies Meta<typeof ProfileEditorStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAvatar: Story = {
  args: {
    initialImage: "https://i.pravatar.cc/160?img=12",
  },
};

export const SimulatedError: Story = {
  args: {
    simulateError: true,
  },
};

export const CropDialogStandalone: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div className="bg-background text-foreground p-6">
        <Button onPress={() => setOpen(true)}>Open crop modal</Button>
        <CropDialog
          open={open}
          onOpenChange={setOpen}
          imageUrl="https://plus.unsplash.com/premium_photo-1707816501449-3c51bb9f93e0?q=80&w=1887&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          onCropComplete={() => undefined}
          onCancel={() => setOpen(false)}
        />
      </div>
    );
  },
};
