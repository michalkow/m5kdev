# Each Deployment environment builds from its own branch

Each Deployment environment builds its own image from its own branch, with its own baked `VITE_*` values. There is no container registry and no image promotion. Instead, the deploy job checks that the release branch's tree equals the tree of a commit on its source branch, which proves the code deployed is code that was tested. Promotion PRs merge with merge commits; release branches receive no direct commits.

## Considered Options

- **Build once, promote the image by digest** — rejected for now: it needs a registry, a release manifest carried across merge commits, and runtime SPA configuration, because public `VITE_*` values (app and server URLs) differ per environment and are baked into the Webapp ([ADR-0006](0006-kernel-owns-baked-spa.md)).
- **Runtime SPA configuration** — rejected for now: it changes the Kernel's baked SPA contract for a guarantee this team size does not need yet.
- **Trust the branch head without a tree check** — rejected: a commit pushed straight to a release branch would deploy untested code.

## Consequences

- Production runs a build that matches what was tested but is not byte-identical to it. A frozen lockfile and the tree check cover most of that gap.
- Every deploy pays a full build.
- Moving to image promotion later means adding a registry, a manifest, and runtime SPA configuration; the branch and Promotion PR model stays the same.
