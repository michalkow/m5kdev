import { publicExperienceSchema } from "@m5kdev/commons/modules/app/experience.schema";
import { renderToStaticMarkup } from "react-dom/server";
import { AppConfigProvider } from "../components/AppConfigProvider";
import { useAppConfig } from "../hooks/useAppConfig";

function Identity() {
  const config = useAppConfig();
  return (
    <a href={config.appUrl}>
      {config.appName}:{config.experience?.product}
    </a>
  );
}

it("renders the selected identity without waiting for authentication", () => {
  const experience = publicExperienceSchema.parse({
    id: "partner",
    product: "radar",
    brand: { name: "Partner Radar" },
    webOrigin: "https://partner.example.test",
    apiOrigin: "https://partner.example.test",
  });
  expect(
    renderToStaticMarkup(
      <AppConfigProvider config={{ experience }}>
        <Identity />
      </AppConfigProvider>
    )
  ).toBe('<a href="https://partner.example.test">Partner Radar:radar</a>');
});

it("keeps existing single-Experience provider configuration supported", () => {
  expect(
    renderToStaticMarkup(
      <AppConfigProvider
        config={{
          appName: "Original",
          appUrl: "https://original.example.test",
          serverUrl: "https://api.example.test",
        }}
      >
        <Identity />
      </AppConfigProvider>
    )
  ).toBe('<a href="https://original.example.test">Original:</a>');
});
