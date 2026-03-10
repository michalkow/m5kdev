import type { Result } from "neverthrow";
import type { z } from "zod";
import { createSelectDTO } from "#modules/base/base.dto";
import { taggings, tags } from "#modules/tag/tag.db";
import type { ServerError } from "#utils/errors";

export const tagsSelectDTO = createSelectDTO(tags);
export const taggingsSelectDTO = createSelectDTO(taggings);

export const tagsSelectOutput = tagsSelectDTO.schema;
export const taggingsSelectOutput = taggingsSelectDTO.schema;

export type TagSelectOutputResult = Result<z.infer<typeof tagsSelectOutput>, ServerError>;
export type TaggingSelectOutputResult = Result<z.infer<typeof taggingsSelectOutput>, ServerError>;
export type TaggingSelectOutputResults = Result<
  z.infer<typeof taggingsSelectOutput>[],
  ServerError
>;
