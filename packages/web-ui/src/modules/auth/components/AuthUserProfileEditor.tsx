import { Button, FieldError, Form, Input, Label, TextField, toast } from "@heroui/react";
import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AvatarUpload } from "../../../components/AvatarUpload";
import { AppLoader } from "../../../modules/app/components/AppLoader";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  image: z.string().nullable(),
});

export function AuthUserProfileEditor() {
  const { t } = useTranslation();
  const { data: session, isLoading } = useSession();
  const [image, setImage] = useState<string | null>(session?.user?.image || null);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const result = profileSchema.safeParse({ name, image });
    if (!result.success) {
      toast.danger(t("web-ui:profile.error"), {
        description: result.error.issues.map((issue) => issue.message).join("; "),
      });
      return;
    }
    authClient
      .updateUser(result.data)
      .then(() => {
        toast.success(t("web-ui:profile.updated"), {
          description: t("web-ui:profile.updateDescription"),
        });
      })
      .catch(() => {
        toast.danger(t("web-ui:profile.error"), {
          description: t("web-ui:profile.errorDescription"),
        });
      });
  }

  if (isLoading) return <AppLoader />;

  return (
    <div className="container py-10 px-4">
      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xl font-semibold">{t("web-ui:profile.settings.title")}</p>
        <p className="text-sm text-muted">{t("web-ui:profile.settings.description")}</p>
      </div>

      <Form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-row gap-4 items-start">
            <AvatarUpload
              currentAvatarUrl={image}
              onUploadComplete={(url) => {
                setImage(url);
              }}
            />

            <TextField
              name="name"
              isRequired
              minLength={2}
              defaultValue={session?.user?.name || ""}
            >
              <Label>{t("web-ui:profile.name")}</Label>
              <Input placeholder={t("web-ui:profile.placeholders.name")} />
              <FieldError />
            </TextField>
          </div>
          <Button type="submit">{t("web-ui:profile.saveChanges")}</Button>
        </div>
      </Form>
    </div>
  );
}
