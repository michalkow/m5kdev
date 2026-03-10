import { safeParseJson } from "@m5kdev/commons/utils/json";
import { err, ok } from "neverthrow";
import type { ServerResult, ServerResultAsync } from "../base/base.dto";
import { BaseService } from "../base/base.service";
import { WEBHOOK_STATUS_ENUM } from "./webhook.constants";
import type { WebhookRepository } from "./webhook.repository";

export class WebhookService extends BaseService<{ webhook: WebhookRepository }, never> {
  async completed(id: string, payload: unknown): ServerResultAsync<void> {
    const result = await this.repository.webhook.completed(id, payload);
    if (result.isErr()) {
      await this.repository.webhook.registerError(
        id,
        WEBHOOK_STATUS_ENUM.ERROR_DATA,
        JSON.stringify(result.error)
      );
      return this.error("INTERNAL_SERVER_ERROR", "Webhook completed failed", {
        cause: result.error,
      });
    }
    return ok();
  }

  async waitForRequest<T>(callback: (url: string) => any, timeoutSec = 60): ServerResultAsync<T> {
    const webhook = await this.repository.webhook.create({
      timeoutSec,
    });
    if (webhook.isErr()) return Promise.reject(webhook.error);
    const url = `${process.env.NGROK_LOCALHOST_TUNNEL || process.env.VITE_SERVER_URL}/webhook/${webhook.value.id}`;
    try {
      await callback(url);
    } catch (error) {
      await this.repository.webhook.registerError(
        webhook.value.id,
        WEBHOOK_STATUS_ENUM.ERROR_CALLBACK,
        JSON.stringify(error)
      );
      return this.error("INTERNAL_SERVER_ERROR", "Error callback failed", { cause: error });
    }

    const startTime = new Date(webhook.value.createdAt).getTime();
    const endTime = startTime + timeoutSec * 1000;

    const promise = await new Promise<ServerResult<T>>((resolve, reject) => {
      const intervalId = setInterval(async () => {
        const currentTime = Date.now();

        // Check if the timeout is reached
        if (currentTime > endTime) {
          await this.repository.webhook.timeout(webhook.value.id);
          clearInterval(intervalId);
          return reject(this.error("TIMEOUT", "Wait for request timeout"));
        }
        const result = await this.repository.webhook.findById(webhook.value.id);
        if (result.isErr()) {
          clearInterval(intervalId);
          return reject(err(result.error));
        }

        if (!result.value) {
          clearInterval(intervalId);
          return reject(this.error("NOT_FOUND", "Wait for request failed: cannot find webhook"));
        }
        const { status, payload } = result.value;
        if (status === "COMPLETED") {
          const data = payload ? safeParseJson<T>(payload, payload as T) : (payload as T);
          clearInterval(intervalId);
          return resolve(ok(data));
        }
        if (status !== "WAITING") {
          clearInterval(intervalId);
          return reject(this.error("BAD_REQUEST", "Wait for request failed"));
        }
      }, 1000);
    });
    return promise;
  }
}
