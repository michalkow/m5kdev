import {
  type ExperienceId,
  type ExperienceRegistryConfig,
  experienceIdSchema,
  experienceRegistrySchema,
  type PublicExperience,
  publicExperienceSchema,
} from "@m5kdev/commons/modules/app/experience.schema";
import type { Request, RequestHandler } from "express";

export class ExperienceContextError extends Error {}

export type ExperienceRequest = Request & { experience?: PublicExperience };

type HeaderInput = Pick<Request, "headers">;

/** App-owned presentation configuration. It never resolves an Actor or an Entitlement. */
export class ExperienceRegistry {
  readonly config: ReturnType<typeof experienceRegistrySchema.parse>;
  readonly strict: boolean;
  private readonly entries = new Map<string, PublicExperience>();
  private readonly webHosts = new Map<string, string>();
  private readonly apiHosts = new Map<string, Set<string>>();
  private readonly origins = new Map<string, string>();

  constructor(
    config: ExperienceRegistryConfig,
    options: { strict?: boolean; deployed?: boolean } = {}
  ) {
    this.config = experienceRegistrySchema.parse(config);
    this.strict = options.strict ?? true;
    for (const [key, definition] of Object.entries(this.config.definitions)) {
      const id = experienceIdSchema.parse(key);
      const brand = this.config.brands[definition.brand];
      if (!brand)
        throw new Error(`Experience ${id} names unknown Brand Profile ${definition.brand}`);
      if (definition.emailProfile && !this.config.emailProfiles[definition.emailProfile]) {
        throw new Error(`Experience ${id} names unknown email profile`);
      }
      for (const origin of [definition.webOrigin, definition.apiOrigin, ...definition.aliases]) {
        if (options.deployed && !origin.startsWith("https://"))
          throw new Error("Deployed Experiences require HTTPS");
      }
      const descriptor = publicExperienceSchema.parse({
        id,
        product: definition.product,
        brand,
        webOrigin: definition.webOrigin,
        apiOrigin: definition.apiOrigin,
      });
      Object.freeze(descriptor.brand);
      this.entries.set(id, Object.freeze(descriptor));
      for (const origin of [definition.webOrigin, ...definition.aliases]) {
        const host = new URL(origin).host;
        if (this.webHosts.has(host)) throw new Error(`Ambiguous Experience web authority ${host}`);
        this.webHosts.set(host, id);
        this.origins.set(origin, id);
      }
      const apiHost = new URL(definition.apiOrigin).host;
      const ids = this.apiHosts.get(apiHost) ?? new Set<string>();
      ids.add(id);
      this.apiHosts.set(apiHost, ids);
    }
    for (const [host, ids] of this.apiHosts) {
      const webOwner = this.webHosts.get(host);
      if (webOwner && (ids.size !== 1 || !ids.has(webOwner)))
        throw new Error(`Ambiguous Experience API authority ${host}`);
    }
    this.get(this.config.defaultExperience);
    // Freeze the parsed copy; callers cannot mutate routing or message identity after boot.
    const freeze = (value: object): void => {
      for (const child of Object.values(value))
        if (child && typeof child === "object") freeze(child);
      Object.freeze(value);
    };
    freeze(this.config);
  }

  get(id: string): PublicExperience {
    const value = this.entries.get(id);
    if (!value || this.config.definitions[id].disabled)
      throw new ExperienceContextError(`Unknown or disabled Experience ${id}`);
    return value;
  }

  get defaultExperience(): PublicExperience {
    return this.get(this.config.defaultExperience);
  }
  get allowedOrigins(): string[] {
    return [
      ...new Set([...this.origins.keys(), ...[...this.entries.values()].map((x) => x.apiOrigin)]),
    ];
  }
  get allowedHosts(): string[] {
    return [...new Set([...this.webHosts.keys(), ...this.apiHosts.keys()])];
  }

  resolveRequest({ headers }: HeaderInput): PublicExperience | undefined {
    if (!this.strict) return this.defaultExperience;
    const forwarded = this.config.trustedProxyHeaders ? headers["x-forwarded-host"] : undefined;
    const rawHost = forwarded ?? headers.host;
    if (typeof rawHost !== "string" || !rawHost || /[\s,/\\@?#]/.test(rawHost))
      throw new ExperienceContextError("Invalid Experience host");
    const host = rawHost.toLowerCase();
    const web = this.webHosts.get(host);
    const api = this.apiHosts.get(host);
    const origin = headers.origin;
    if (origin !== undefined && typeof origin !== "string")
      throw new ExperienceContextError("Invalid Experience Origin");
    const originId = origin ? this.origins.get(origin) : undefined;
    if (origin && (!originId || (web ? originId !== web : !api?.has(originId))))
      throw new ExperienceContextError("Conflicting Experience host and Origin");
    if (web) return this.get(web);
    if (api)
      return originId ? this.get(originId) : api.size === 1 ? this.get([...api][0]) : undefined;
    throw new ExperienceContextError("Unknown Experience host");
  }

  require(experience?: PublicExperience | ExperienceId | string): PublicExperience {
    if (experience) return this.get(typeof experience === "string" ? experience : experience.id);
    if (!this.strict) return this.defaultExperience;
    throw new ExperienceContextError("Experience context is required");
  }

  destination(experience: PublicExperience, path: string): string {
    const target = new URL(path, experience.webOrigin);
    if (
      target.origin !== experience.webOrigin ||
      target.username ||
      target.password ||
      /[\\\r\n]/.test(path)
    )
      throw new ExperienceContextError("Invalid Experience return destination");
    return target.href;
  }

  emailProfile(experience: PublicExperience) {
    const key = this.config.definitions[experience.id].emailProfile;
    return key ? this.config.emailProfiles[key] : undefined;
  }
}

export function experienceMiddleware(registry: ExperienceRegistry): RequestHandler {
  return (req: ExperienceRequest, res, next) => {
    try {
      if (
        req.path === "/healthz" &&
        registry.config.infrastructureHosts.includes(req.headers.host ?? "")
      )
        return next();
      req.experience = registry.resolveRequest(req);
      return next();
    } catch (error) {
      if (!(error instanceof ExperienceContextError)) return next(error);
      return res.status(400).json({ message: error.message });
    }
  };
}
