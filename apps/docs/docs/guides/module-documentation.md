---
sidebar_position: 2
---

# Writing module docs

Module pages should describe a complete capability across the packages that
participate in it.

## Page shape

Use this structure for detailed module docs:

1. Start with what the module does and when to use it.
2. Describe shared contracts from `@m5kdev/commons`.
3. Describe backend composition, repositories, services, routers, and jobs.
4. Describe frontend hooks from `@m5kdev/frontend`.
5. Describe UI components from `@m5kdev/web-ui` when they exist.
6. End with a complete app-level flow and operational requirements.

## Ownership rule

Package pages explain where code lives. Module pages explain how the pieces work
together. If the same feature crosses backend, frontend, and UI packages, document
the feature once under `modules/`.
