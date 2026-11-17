import { publicExperienceSchema } from "@m5kdev/commons/modules/app/experience.schema";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { initializeI18n } from "./i18n";
import { Providers } from "./Providers";
import { Router } from "./Router";
import "./index.css";

const supplied = document.getElementById("experience");
const experience = supplied
  ? publicExperienceSchema.parse(JSON.parse(supplied.textContent ?? ""))
  : undefined;
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
void initializeI18n().then(() =>
  createRoot(root).render(
    <NuqsAdapter>
      <BrowserRouter>
        <Providers supplied={experience}>
          <Router />
        </Providers>
      </BrowserRouter>
    </NuqsAdapter>
  )
);
