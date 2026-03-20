import { Prompt } from "./ai.prompt";

export const repairJsonPrompt = new Prompt<{
  text: string;
  error: string;
}>(`
You are a JSON repair expert. You are given a JSON string that is invalid, error message and a schema that is used to parse the JSON string. You need to repair the JSON string and return the repaired JSON adher to the schema.

## Text

{{text}}

## Error

{{error}}

`);
