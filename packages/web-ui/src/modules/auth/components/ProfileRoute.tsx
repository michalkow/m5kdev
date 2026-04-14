import {Button, Card, Input} from "@heroui/react";

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

export function ProfileRoute() {
  const { t } = useTranslation();
  const { data: session } = useSession();

  const form = useForm<ProfileFormValues>({
    defaultValues: {
      name: session?.user?.name || "",
      image: session?.user?.image || null,
    },
  });

  function onSubmit(data: ProfileFormValues) {
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
    <div className="container py-10 px-4">
      <Card>
        <Card.Header className="flex flex-col gap-1">
          <p className="text-xl font-semibold">{t("web-ui:profile.settings.title")}</p>
          <p className="text-sm text-default-600">{t("web-ui:profile.settings.description")}</p>
        </Card.Header>
        <Card.Content>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex justify-center">
                <FormField
                  control={form.control}
                  name="image"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <AvatarUpload
                          currentAvatarUrl={field.value}
                          onUploadComplete={(url) => {
                            console.log(url);
                            field.onChange(url);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder={t("web-ui:profile.placeholders.name")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit">Save Changes</Button>
            </form>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
}
