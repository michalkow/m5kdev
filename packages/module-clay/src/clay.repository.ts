import type { ServerResultAsync } from "@m5kdev/backend/base/base.dto";
import { BaseExternaRepository } from "@m5kdev/backend/base/base.repository";
import { err, ok } from "neverthrow";

export class ClayRepository extends BaseExternaRepository {
  async sendToWebhook(
    webhookUrl: string,
    row: Record<string, unknown>,
    callbackUrl: string
  ): ServerResultAsync<void> {
    const bodyResult = this.throwable(() => ok(JSON.stringify({ ...row, callback: callbackUrl })));
    if (bodyResult.isErr()) return err(bodyResult.error);

    const responseResult = await this.throwablePromise(() =>
      fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.CLAY_WEBHOOK_AUTH_TOKEN
            ? { "x-clay-webhook-auth": process.env.CLAY_WEBHOOK_AUTH_TOKEN }
            : {}),
        },
        body: bodyResult.value,
      })
    );
    if (responseResult.isErr()) return err(responseResult.error);

    const response = responseResult.value;
    if (!response.ok) {
      // upstream Clay call failed — not the caller's fault
      return this.error("BAD_GATEWAY", `HTTP error! status: ${response.status}`, {
        cause: response,
      });
    }
    return ok();
  }
}
