export function startChatwoot(
  {
    baseUrl,
    websiteToken,
  }: {
    baseUrl: string;
    websiteToken: string;
  },
  {
    user,
  }: {
    user?: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  },
  allowAnonymous?: boolean
) {
  // avoid loading twice
  if ((window as any).chatwootSDK) return;

  if (!allowAnonymous && !user) {
    throw new Error("User is required to start Chatwoot");
  }

  const script = document.createElement("script");
  script.src = `${baseUrl}/packs/js/sdk.js`;
  script.async = true;

  script.onload = () => {
    (window as any).chatwootSDK.run({
      websiteToken,
      baseUrl,
    });
  };

  document.body.appendChild(script);

  if (user) {
    window.addEventListener("chatwoot:ready", () => {
      // @ts-expect-error chatwoot is in global window
      window.$chatwoot.setUser(user.id, {
        email: user.email,
        name: user.name,
        avatar_url: user.image,
      });
    });
  }
}
