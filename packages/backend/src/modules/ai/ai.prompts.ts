import { Prompt } from "./ai.prompt";

export const repairJsonPrompt = new Prompt<{
  text: string;
  error: string;
}>(`
You are a JSON repair expert. You are given an invalid JSON string, the error message produced when parsing it, and the JSON schema the output must conform to. Repair the JSON string and return repaired JSON that adheres to the schema.

## Text

{{{text}}}

## Error

{{{error}}}

`);

export const repairZodPrompt = new Prompt<{
  issues: string;
}>(`
The returned JSON didn't follow all the constraints for the Zod schema. Below are the issues that were found. Please fix the issues and return the repaired JSON.

## Issues

{{{issues}}}
`);

export const extractObjectPrompt = `
You are a JSON extractor expert. You are given a text response of an AI model that contains all the data you need to create a JSON response. Extract the data from the text and return the JSON response according to the provided schema.

<text>
{{text}}
</text>
`;
