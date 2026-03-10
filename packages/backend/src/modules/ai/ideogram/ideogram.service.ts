import type {
  IdeogramV3GenerateInput,
  IdeogramV3GenerateOutput,
} from "#modules/ai/ideogram/ideogram.dto";
import type { IdeogramRepository } from "#modules/ai/ideogram/ideogram.repository";
import type { ServerResultAsync } from "#modules/base/base.dto";
import { BaseService } from "#modules/base/base.service";

export class IdeogramService extends BaseService<{ ideogram: IdeogramRepository }, never> {
  async generate(input: IdeogramV3GenerateInput): ServerResultAsync<IdeogramV3GenerateOutput> {
    const result = await this.repository.ideogram.generate(input);
    return result;
  }
}
