import type { Request, Response } from "express";
import { BaseModule, type ModuleExpressContext, type TableMap } from "../base/base.module";
import type { EmailModule } from "./email.module";
import type { EmailService, StoredEmail, StoredEmailSummary } from "./email.service";

type EmailPreviewModuleDeps = { email: EmailModule };

export type EmailPreviewModuleOptions = {
  mountPath?: string;
  allowDelete?: boolean;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getRecipients(email: Pick<StoredEmailSummary, "to">) {
  return Array.isArray(email.to) ? email.to.join(", ") : email.to;
}

function renderInbox(emails: StoredEmailSummary[]) {
  const rows = emails
    .map(
      (email) => `
        <tr>
          <td><a href="/__emails/${escapeHtml(email.id)}">${escapeHtml(email.subject)}</a></td>
          <td>${escapeHtml(email.templateId)}</td>
          <td>${escapeHtml(getRecipients(email))}</td>
          <td>${escapeHtml(email.createdAt)}</td>
          <td><a href="/__emails/${escapeHtml(email.id)}.json">json</a></td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stored emails</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; color: #111827; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid #e5e7eb; padding: .75rem; text-align: left; vertical-align: top; }
      th { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
      a { color: #0f766e; }
      .empty { border: 1px dashed #d1d5db; padding: 2rem; border-radius: .5rem; color: #6b7280; }
    </style>
  </head>
  <body>
    <h1>Stored emails</h1>
    ${
      emails.length
        ? `<table>
            <thead><tr><th>Subject</th><th>Template</th><th>To</th><th>Created</th><th>Payload</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : '<div class="empty">No stored emails.</div>'
    }
  </body>
</html>`;
}

function renderEmailPreview(email: StoredEmail) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(email.subject)}</title>
    <style>
      body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: #111827; background: #f3f4f6; }
      header { padding: 1rem 1.25rem; background: white; border-bottom: 1px solid #e5e7eb; }
      dl { display: grid; grid-template-columns: max-content 1fr; gap: .35rem 1rem; margin: 0; font-size: .875rem; }
      dt { color: #6b7280; }
      iframe { display: block; width: 100%; height: calc(100vh - 9rem); border: 0; background: white; }
      .missing { margin: 1rem; padding: 1rem; border: 1px dashed #d1d5db; border-radius: .5rem; background: white; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(email.subject)}</h1>
      <dl>
        <dt>Template</dt><dd>${escapeHtml(email.templateId)}</dd>
        <dt>To</dt><dd>${escapeHtml(getRecipients(email))}</dd>
        <dt>Created</dt><dd>${escapeHtml(email.createdAt)}</dd>
        <dt>Raw</dt><dd><a href="/__emails/${escapeHtml(email.id)}/raw.html">raw.html</a> · <a href="/__emails/${escapeHtml(email.id)}.json">json</a></dd>
      </dl>
    </header>
    ${
      email.html
        ? `<iframe title="Rendered email" src="/__emails/${escapeHtml(email.id)}/raw.html"></iframe>`
        : '<div class="missing">This stored email did not include rendered HTML.</div>'
    }
  </body>
</html>`;
}

function sendJson(res: Response, status: number, body: unknown) {
  res
    .status(status)
    .type("application/json")
    .send(JSON.stringify(body, null, 2));
}

export class EmailPreviewModule extends BaseModule<
  EmailPreviewModuleDeps,
  TableMap,
  Record<string, never>,
  Record<string, never>,
  never
> {
  readonly id = "email-preview";
  override readonly dependsOn = ["email"] as const;

  private readonly mountPath: string;
  private readonly allowDelete: boolean;

  constructor(options: EmailPreviewModuleOptions = {}) {
    super();
    this.mountPath = options.mountPath ?? "/__emails";
    this.allowDelete = options.allowDelete ?? false;
  }

  override express({ deps, infra }: ModuleExpressContext<EmailPreviewModuleDeps>) {
    const emailService = deps.email.services.email as EmailService;
    const router = infra.express;

    router.get(this.mountPath, async (_req: Request, res: Response) => {
      const emails = await emailService.listStoredEmails();
      res.type("html").send(renderInbox(emails));
    });

    if (this.allowDelete) {
      router.delete(this.mountPath, async (_req: Request, res: Response) => {
        await emailService.clearStoredEmails();
        sendJson(res, 200, { status: true });
      });
    }

    router.get(`${this.mountPath}/latest.json`, async (req: Request, res: Response) => {
      const email = await emailService.findLatestStoredEmail({
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        templateId: typeof req.query.templateId === "string" ? req.query.templateId : undefined,
      });

      if (!email) {
        sendJson(res, 404, { error: "Email not found" });
        return;
      }

      sendJson(res, 200, email);
    });

    router.get(`${this.mountPath}/:id/raw.html`, async (req: Request, res: Response) => {
      const email = await emailService.readStoredEmail(req.params.id);
      if (!email) {
        res.status(404).type("text/plain").send("Email not found");
        return;
      }
      res.type("html").send(email.html ?? "");
    });

    router.get(`${this.mountPath}/:id.json`, async (req: Request, res: Response) => {
      const email = await emailService.readStoredEmail(req.params.id);
      if (!email) {
        sendJson(res, 404, { error: "Email not found" });
        return;
      }
      sendJson(res, 200, email);
    });

    router.get(`${this.mountPath}/:id`, async (req: Request, res: Response) => {
      const email = await emailService.readStoredEmail(req.params.id);
      if (!email) {
        res.status(404).type("text/plain").send("Email not found");
        return;
      }
      res.type("html").send(renderEmailPreview(email));
    });
  }
}
