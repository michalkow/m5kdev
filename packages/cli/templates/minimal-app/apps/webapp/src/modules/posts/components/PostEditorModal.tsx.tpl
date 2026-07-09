import { Button, FieldError, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import type { PostCreateInputSchema } from "{{PACKAGE_SCOPE}}/shared/modules/posts/posts.schema";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { PostRow } from "../hooks/usePostsList";

interface PostEditorModalProps {
  isOpen: boolean;
  /** Row being edited; undefined means creating a new post. */
  post?: PostRow;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: PostCreateInputSchema, id?: string) => Promise<boolean>;
}

/**
 * Uncontrolled HeroUI form: native HTML validation (`isRequired`) guards the
 * fields and values are read from FormData on submit — no form library, no
 * per-field state.
 */
export function PostEditorModal({ isOpen, post, isSaving, onClose, onSave }: PostEditorModalProps) {
  const { t } = useTranslation("blog{{PACKAGE_SCOPE}}");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload: PostCreateInputSchema = {
      title: String(formData.get("title") ?? "").trim(),
      slug: String(formData.get("slug") ?? "").trim() || undefined,
      excerpt: String(formData.get("excerpt") ?? "").trim() || undefined,
      content: String(formData.get("content") ?? "").trim(),
    };

    if (await onSave(payload, post?.id)) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Backdrop>
        <Modal.Container scroll="inside" size="lg" className="max-w-5xl">
          <Modal.Dialog>
            {/* key remounts the form so defaultValue resets when switching rows */}
            <Form key={post?.id ?? "new"} className="contents" onSubmit={onSubmit}>
              <Modal.Header className="flex flex-col gap-2 px-6 pt-6">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-amber-700/80">
                  {post ? t("posts.editor.editEyebrow") : t("posts.editor.newEyebrow")}
                </p>
                <Modal.Heading className="font-editorial text-4xl leading-none text-ink">
                  {post ? t("posts.editor.editTitle") : t("posts.editor.newTitle")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-4 px-6 pb-2">
                <TextField
                  isRequired
                  name="title"
                  defaultValue={post?.title ?? ""}
                  variant="secondary"
                  className="grid gap-2"
                >
                  <Label className="text-sm font-medium">{t("posts.editor.fields.title")}</Label>
                  <Input className="rounded-lg" />
                  <FieldError />
                </TextField>
                <TextField
                  name="slug"
                  defaultValue={post?.slug ?? ""}
                  variant="secondary"
                  className="grid gap-2"
                >
                  <Label className="text-sm font-medium">{t("posts.editor.fields.slug")}</Label>
                  <Input className="rounded-lg" />
                  <FieldError />
                </TextField>
                <TextField
                  name="excerpt"
                  defaultValue={post?.excerpt ?? ""}
                  variant="secondary"
                  className="grid gap-2"
                >
                  <Label className="text-sm font-medium">{t("posts.editor.fields.excerpt")}</Label>
                  <TextArea className="rounded-lg min-h-[5.5rem]" rows={3} />
                  <FieldError />
                </TextField>
                <TextField
                  isRequired
                  name="content"
                  defaultValue={post?.content ?? ""}
                  variant="secondary"
                  className="grid gap-2"
                >
                  <Label className="text-sm font-medium">{t("posts.editor.fields.content")}</Label>
                  <TextArea className="rounded-lg min-h-[12rem]" rows={10} />
                  <FieldError />
                </TextField>
              </Modal.Body>
              <Modal.Footer className="px-6 pb-6">
                <Button className="rounded-full" variant="tertiary" type="button" onPress={onClose}>
                  {t("posts.editor.cancel")}
                </Button>
                <Button
                  className="rounded-full"
                  variant="primary"
                  type="submit"
                  isPending={isSaving}
                >
                  {post ? t("posts.editor.save") : t("posts.editor.create")}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
