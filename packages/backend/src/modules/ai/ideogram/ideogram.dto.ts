import { z } from "zod";
import {
  ideogramAspectRatios,
  ideogramColorPalettePreset,
  ideogramMagicPrompt,
  ideogramRenderingSpeed,
  ideogramResolutions,
  ideogramStylePresets,
  ideogramStyleTypes,
} from "#modules/ai/ideogram/ideogram.constants";

export const ideogramAISchema = z.object({
  prompt: z.string().describe("Create a prompt for the image generation."),
  style_type: z.enum(ideogramStyleTypes).describe("Choose a style type for the image generation."),
  // style_preset: z
  //   .enum(ideogramStylePresets)
  //   .describe("Choose a style preset for the image generation."),
});

export const ideogramV3GenerateInputSchema = z.object({
  prompt: z.string(),
  seed: z.number().optional(),
  resolution: z.enum(ideogramResolutions).optional(),
  rendering_speed: z.enum(ideogramRenderingSpeed).optional(),
  magic_prompt: z.enum(ideogramMagicPrompt).optional(),
  negative_prompt: z.string().optional(),
  num_images: z.number().optional(),
  color_palette: z
    .object({
      ColorPaletteWithPresetName: z.object({ name: z.enum(ideogramColorPalettePreset) }).optional(),
      ColorPaletteWithMembers: z
        .object({
          members: z.array(
            z.object({ color_hex: z.string(), color_weight: z.number().min(0.05).max(1) })
          ),
        })
        .optional(),
    })
    .optional(),
  style_codes: z.array(z.string()).optional(),
  aspect_ratio: z.enum(ideogramAspectRatios).optional(),
  style_type: z.enum(ideogramStyleTypes).optional(),
  style_preset: z.enum(ideogramStylePresets).optional(),
  style_reference_images: z.array(z.file()).optional(),
  character_reference_images: z.array(z.file()).optional(),
  character_reference_images_mask: z.file().optional(),
});

export const ideogramV3GenerateOutputSchema = z.object({
  created: z.string(),
  data: z.array(
    z.object({
      prompt: z.string(),
      resolution: z.string(),
      is_image_safe: z.boolean(),
      seed: z.number(),
      url: z.url(),
      style_type: z.enum(ideogramStyleTypes),
    })
  ),
});

export type IdeogramV3GenerateInput = z.infer<typeof ideogramV3GenerateInputSchema>;
export type IdeogramV3GenerateOutput = z.infer<typeof ideogramV3GenerateOutputSchema>;
