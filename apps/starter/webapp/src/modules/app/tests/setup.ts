import { TextDecoder, TextEncoder } from "node:util";

// React Router uses the browser encoding APIs, which jsdom does not provide.
Object.assign(globalThis, { TextDecoder, TextEncoder });
