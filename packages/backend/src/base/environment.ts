/**
 * Deployment environment: where the app runs. Read from `APP_ENV`, never from
 * `NODE_ENV` (which is `production` on every deployed app).
 */
export const DEPLOYMENT_ENVIRONMENTS = [
  "local",
  "development",
  "staging",
  "canary",
  "production",
] as const;

export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];

export type EnvSource = Record<string, string | undefined>;

export interface AppEnvironment {
  /** `APP_ENV` */
  readonly environment: DeploymentEnvironment;
  /** `APP_SLUG` — lowercase app identifier shared by every Deployment environment. */
  readonly slug: string;
}

const APP_SLUG_PATTERN = /^[a-z][a-z0-9-]*[a-z0-9]$/;

function isDeploymentEnvironment(value: string): value is DeploymentEnvironment {
  return (DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Parse and validate `APP_ENV` and `APP_SLUG`. Throws when either is missing or
 * invalid so a misconfigured deploy fails at boot instead of joining another
 * environment's queues.
 */
export function parseAppEnvironment(env: EnvSource = process.env): AppEnvironment {
  const environment = env.APP_ENV?.trim();
  if (!environment || !isDeploymentEnvironment(environment)) {
    throw new Error(
      `APP_ENV must be one of ${DEPLOYMENT_ENVIRONMENTS.join(", ")}${
        environment ? ` (got "${environment}")` : ""
      }`
    );
  }
  const slug = env.APP_SLUG?.trim();
  if (!slug || !APP_SLUG_PATTERN.test(slug)) {
    throw new Error(
      "APP_SLUG must be a lowercase slug (letters, digits, and dashes, starting with a letter)"
    );
  }
  return { environment, slug };
}

/**
 * True when `APP_ENV` names a deployed environment. Unset or `local` is not
 * deployed, so one-shot scripts and tests keep local behaviour.
 */
export function isDeployedEnvironment(env: EnvSource = process.env): boolean {
  const environment = env.APP_ENV?.trim();
  return Boolean(environment) && environment !== "local";
}

/**
 * Read a configuration value that every deployed environment must set. When
 * `APP_ENV` is `local`, `localDefault` stands in for a missing value; anywhere
 * else a missing value throws.
 */
export function requireEnvValue(
  name: string,
  options: { localDefault?: string; env?: EnvSource } = {}
): string {
  const env = options.env ?? process.env;
  const value = env[name];
  if (value) return value;
  const { environment } = parseAppEnvironment(env);
  if (environment === "local" && options.localDefault !== undefined) {
    return options.localDefault;
  }
  throw new Error(`${name} must be set when APP_ENV=${environment}`);
}
