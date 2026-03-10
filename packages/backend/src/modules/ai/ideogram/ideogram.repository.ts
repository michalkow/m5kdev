import { ok } from "neverthrow";
import type {
  IdeogramV3GenerateInput,
  IdeogramV3GenerateOutput,
} from "./ideogram.dto";
import type { ServerResultAsync } from "../../base/base.dto";
import { BaseExternaRepository } from "../../base/base.repository";

export class IdeogramRepository extends BaseExternaRepository {
  async generate(input: IdeogramV3GenerateInput): ServerResultAsync<IdeogramV3GenerateOutput> {
    if (!process.env.IDEOGRAM_API_KEY)
      return this.error("INTERNAL_SERVER_ERROR", "IDEOGRAM_API_KEY is not set");
    return this.throwableAsync(async () => {
      const formData = new FormData();
      formData.append("prompt", input.prompt);
      if (input.seed) formData.append("seed", input.seed.toString());
      if (input.resolution) formData.append("resolution", input.resolution);
      if (input.rendering_speed) formData.append("rendering_speed", input.rendering_speed);
      if (input.magic_prompt) formData.append("magic_prompt", input.magic_prompt);
      if (input.negative_prompt) formData.append("negative_prompt", input.negative_prompt);
      if (input.num_images) formData.append("num_images", input.num_images.toString());
      if (input.color_palette)
        formData.append("color_palette", JSON.stringify(input.color_palette));
      if (input.style_codes) formData.append("style_codes", JSON.stringify(input.style_codes));
      if (input.aspect_ratio) formData.append("aspect_ratio", input.aspect_ratio);
      if (input.style_type) formData.append("style_type", input.style_type);
      if (input.style_preset) formData.append("style_preset", input.style_preset);
      //TODO: Add file support

      const response = await fetch("https://api.ideogram.ai/v1/ideogram-v3/generate", {
        method: "POST",
        headers: { "Api-Key": process.env.IDEOGRAM_API_KEY! },
        body: formData,
      });
      const data = await response.json();
      return ok(data as IdeogramV3GenerateOutput);
    });
  }
}
