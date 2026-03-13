{
  "extends": "@m5kdev/config/tsconfig.base.json",
  "rootDir": ".",
  "compilerOptions": {
    "esModuleInterop": true,
    "importHelpers": true,
    "noEmit": true,
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "exclude": ["node_modules"],
  "include": ["src/**/*.ts"]
}
