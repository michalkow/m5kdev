---
sidebar_position: 19
---

# PDF module

The PDF module extracts text from PDF files so app features (AI prompts, search,
imports) can work with document content.

## Package map

| Package | What it owns |
| --- | --- |
| `@m5kdev/module-pdf` | `PdfModule` and `PdfService`. |

## Usage

```ts
import { createBackendApp } from "@m5kdev/backend/app";
import { PdfModule } from "@m5kdev/module-pdf";

createBackendApp(config, [new PdfModule()]);

const text = await this.service.pdf.convertToText(url);
```

## Service API

| Method | Description |
| --- | --- |
| `convertToText(url)` | Fetch a PDF by URL and return its extracted text (`ServerResultAsync<string>`) |

Pair with the [file module](/modules/file) — `getS3DownloadUrl` produces a
short-lived URL you can pass straight to `convertToText`.
