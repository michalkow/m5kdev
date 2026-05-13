/// <reference types="vite/client" />

declare module "virtual:i18next-loader" {
  const resources: Record<string, Record<string, Record<string, string>>>;
  export default resources;
}
