import { err, ok } from "neverthrow";
import type { ServerResultAsync } from "../base/base.dto";
import { BaseExternaRepository } from "../base/base.repository";

const { CLAY_WEBHOOK_AUTH_TOKEN } = process.env;

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
          ...(CLAY_WEBHOOK_AUTH_TOKEN ? { "x-clay-webhook-auth": CLAY_WEBHOOK_AUTH_TOKEN } : {}),
        },
        body: bodyResult.value,
      })
    );
    if (responseResult.isErr()) return err(responseResult.error);

    const response = responseResult.value;
    if (!response.ok) {
      return this.error("BAD_REQUEST", `HTTP error! status: ${response.status}`, {
        cause: response,
      });
    }
    return ok();
  }
}
