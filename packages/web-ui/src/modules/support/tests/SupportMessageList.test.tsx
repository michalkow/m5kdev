import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { SupportMessageList } from "../components/SupportMessageList";

it("renders message content as text in an announced support log", async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: {
      en: { "web-ui": { support: { messages: "Messages", author: { user: "User" } } } },
    },
  });
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <SupportMessageList
        messages={[
          {
            id: "message",
            caseId: "case",
            sequence: 1,
            authorUserId: "alice",
            authorKind: "user",
            visibility: "public",
            body: '<img src=x onerror="alert(1)">',
            acceptedAt: new Date(0),
            publishedAt: new Date(0),
          },
        ]}
      />
    </I18nextProvider>
  );
  expect(html).toContain('role="log"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<img");
});
