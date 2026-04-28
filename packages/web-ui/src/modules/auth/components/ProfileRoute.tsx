import { Button, Input, Label, TextField } from "@heroui/react";

import { authClient } from "@m5kdev/frontend/modules/auth/auth.lib";
import { useSession } from "@m5kdev/frontend/modules/auth/hooks/useSession";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { AvatarUpload } from "../../../components/AvatarUpload";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../../../components/ui/form";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  image: z.string().nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export interface ProfileEditorProps {
  readonly initialValues: ProfileFormValues;
  readonly onSubmit: (data: ProfileFormValues) => void | Promise<void>;
}

export function ProfileEditor({ initialValues, onSubmit }: ProfileEditorProps) {
  const { t } = useTranslation();

  const form = useForm<ProfileFormValues>({
    defaultValues: initialValues,
  });

  return (
    <div className="container py-10 px-4">
      <div className="flex flex-col gap-1 mb-4">
        <p className="text-xl font-semibold">{t("web-ui:profile.settings.title")}</p>
        <p className="text-sm text-muted">{t("web-ui:profile.settings.description")}</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex flex-row gap-4 items-start">
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <AvatarUpload
                      currentAvatarUrl={field.value}
                      onUploadComplete={(url) => {
                        field.onChange(url);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <Label>{t("web-ui:profile.name")}</Label>
                  </FormLabel>
                  <FormControl>
                    <TextField>
                      <Input placeholder={t("web-ui:profile.placeholders.name")} {...field} />
                    </TextField>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button type="submit">{t("web-ui:profile.saveChanges")}</Button>
        </form>
      </Form>
    </div>
  );
}

export function ProfileRoute() {
  const { t } = useTranslation();
  const { data: session } = useSession();

  function handleSubmit(data: ProfileFormValues): void {
    authClient
      .updateUser(data)
      .then(() => {
        toast.success(t("web-ui:profile.updated"), {
          description: t("web-ui:profile.updateDescription"),
        });
      })
      .catch(() => {
        toast.error(t("web-ui:profile.error"), {
          description: t("web-ui:profile.errorDescription"),
        });
      });
  }

  return (
    <ProfileEditor
      initialValues={{
        name: session?.user?.name || "",
        image: session?.user?.image || null,
      }}
      onSubmit={handleSubmit}
    />
  );
}
