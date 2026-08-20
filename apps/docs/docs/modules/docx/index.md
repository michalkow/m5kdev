---
sidebar_position: 16
---

# Docx module

The docx module converts Word documents to Markdown so downstream features
(AI prompts, search, previews) can consume user-uploaded `.docx` content as text.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/module-docx` | `DocxModule` and `DocxService`. |

## Usage

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { DocxModule } from "@m5kdev/module-docx";

createBackendApp(config, [new DocxModule()]);

const markdown = await this.service.docx.convertToMarkdown(buffer);
```

## Service API

| Method | Description |
| --- | --- |
| `convertToMarkdown(buffer)` | Convert a `.docx` file buffer to Markdown (`ServerResultAsync<string>`) |

Pair with the [file module](/modules/file) to fetch uploaded documents from S3
before conversion.
