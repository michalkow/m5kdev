{
  "extends": "@m5kdev/config/tsconfig.node.json",
  "rootDir": ".",
  "compilerOptions": {
    "esModuleInterop": true,
    "importHelpers": true,
    "jsx": "react-jsx",
    "noEmit": true,
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "exclude": ["node_modules"],
  "include": ["src/**/*.ts", "drizzle/**/*.ts", "drizzle.config.ts", "tsup.config.ts"]
}
