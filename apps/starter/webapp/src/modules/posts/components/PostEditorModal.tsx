import { Button, FieldError, Form, Input, Label, Modal, TextArea, TextField } from "@heroui/react";
import type { PostCreateInputSchema } from "@starter-app/shared/modules/posts/posts.schema";
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
  const { t } = useTranslation("starter-app");

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
            <Form key={post?.id ?? "new"} className="contents" onSubmit={onSubmit}>
              <Modal.Header className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  {post ? t("posts.editor.editEyebrow") : t("posts.editor.newEyebrow")}
                </p>
                <Modal.Heading>
                  {post ? t("posts.editor.editTitle") : t("posts.editor.newTitle")}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="grid gap-4">
                <TextField
                  isRequired
                  name="title"
                  defaultValue={post?.title ?? ""}
                  variant="secondary"
                  className="grid gap-2"
                >
                  <Label>{t("posts.editor.fields.title")}</Label>
                  <Input />
                  <FieldError />
                </TextField>
                <TextField
                  name="slug"
                  defaultValue={post?.slug ?? ""}
                  variant="secondary"
                  className="grid gap-2"
                >
                  <Label>{t("posts.editor.fields.slug")}</Label>
                  <Input />
                  <FieldError />
                </TextField>
                <TextField
                  name="excerpt"
                  defaultValue={post?.excerpt ?? ""}
                  variant="secondary"
                  className="grid gap-2"
                >
                  <Label>{t("posts.editor.fields.excerpt")}</Label>
                  <TextArea className="min-h-[5.5rem]" rows={3} />
                  <FieldError />
                </TextField>
                <TextField
                  isRequired
                  name="content"
                  defaultValue={post?.content ?? ""}
                  variant="secondary"
                  className="grid gap-2"
                >
                  <Label>{t("posts.editor.fields.content")}</Label>
                  <TextArea className="min-h-[12rem]" rows={10} />
                  <FieldError />
                </TextField>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" type="button" onPress={onClose}>
                  {t("posts.editor.cancel")}
                </Button>
                <Button variant="primary" type="submit" isPending={isSaving}>
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
