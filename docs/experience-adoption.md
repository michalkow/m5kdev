# Domain-selected Experiences

Experiences are presentation configuration, independent of Organization tenancy, Billing Entitlements and Grants. Apps own their routes and workflows; the Kernel owns host resolution. See ADR-0038 and specification #88.

## Configure public identity

Existing `app.name`, `app.urls`, `app.brand` and their environment defaults remain a supported single-Experience shorthand. To opt into explicit resolution, supply `app.experiences` instead of those competing fields:

```ts
experiences: {
  defaultExperience: "radar",
  brands: { radar: { name: "Radar" }, partner: { name: "Partner Radar" } },
  definitions: {
    radar: { product: "radar", brand: "radar", webOrigin: "https://radar.example", apiOrigin: "https://radar.example" },
    partner: { product: "radar", brand: "partner", webOrigin: "https://partner.example", apiOrigin: "https://partner.example" },
  },
}
```

The default identifies deliberately context-free operations. It never rescues an unknown browser host. Duplicate web authorities, unknown profiles, invalid origins and ambiguous API ownership fail at boot. Deployed configurations require HTTPS.

## Bootstrap before authentication

`GET /app/experience` returns only the selected public descriptor with private/no-store caching. Call `loadExperience` from frontend app integration before rendering providers, or supply a matching validated descriptor to a separately hosted frontend. Pass `{ experience, locales, roles }` to `AppConfigProvider`; existing hooks expose the selected name and canonical URLs before auth loading.

Keep shells/routes in app composition. Multiple Experiences can share a product key and have different brands. Theme and copy references select app-owned resources; they are not arbitrary theme code. The Kernel still serves one optional baked SPA root; separate frontend builds can be hosted externally.

## Deploy domains and proxies

Prefer a same-origin API/auth proxy on each product domain. When several Experiences share a distinct API authority, only an exact registered browser Origin/API pair selects one. Ordinary no-Origin API calls may remain presentation-neutral; a branded operation must receive explicit validated context.

List aliases as canonical origins. `infrastructureHosts` may admit unbranded health probes. Set `trustedProxyHeaders` only behind an ingress that overwrites client-supplied forwarded headers. Unknown/conflicting hosts and origins fail without generating cookies or redirects. Partition external caches by host/Experience and locale; private auth and capability responses are not shared content.

## Adoption checkpoints

The registry/bootstrap slice is the first checkpoint. Subsequent implementation tickets migrate auth, email, invitation, Connection and billing flows. Complete adoption requires the final integration audit in #100; adding another domain alone does not complete those flows.

One Trial Plan per currency, one Subscription per Organization/environment and account-wide Stripe identity constraints remain. This feature does not provision domains/certificates, merge data, add independent subscriptions or promise cross-domain SSO.
