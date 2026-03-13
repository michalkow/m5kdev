{
  "extends": "@m5kdev/config/tsconfig.node.json",
  "rootDir": ".",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noEmit": true,
    "tsBuildInfoFile": "dist/tsconfig.tsbuildinfo"
  },
  "exclude": ["node_modules"],
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
