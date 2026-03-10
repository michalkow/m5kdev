import type {
  IdeogramV3GenerateInput,
  IdeogramV3GenerateOutput,
} from "./ideogram.dto";
import type { IdeogramRepository } from "./ideogram.repository";
import type { ServerResultAsync } from "../../base/base.dto";
import { BaseService } from "../../base/base.service";

export class IdeogramService extends BaseService<{ ideogram: IdeogramRepository }, never> {
  async generate(input: IdeogramV3GenerateInput): ServerResultAsync<IdeogramV3GenerateOutput> {
    const result = await this.repository.ideogram.generate(input);
    return result;
  }
}
