{
  "$schema": "https://biomejs.dev/schemas/2.5.9/schema.json",
  "vcs": {
    "enabled": false,
    "clientKind": "git",
    "useIgnoreFile": false
  },
  "files": {
    "ignoreUnknown": false,
    "includes": [
      "**",
      "!**/node_modules",
      "!!**/dist",
      "!!**/storybook-static",
      "!**/.react-router",
      "!**/.m5kdev.json",
      "!**/drizzle/meta"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentWidth": 2,
    "indentStyle": "space",
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "preset": "recommended",
      "correctness": {
        "noUnusedVariables": "warn",
        "useExhaustiveDependencies": "warn",
        "noEmptyPattern": "warn",
        "useUniqueElementIds": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn",
        "noArrayIndexKey": "warn"
      },
      "style": {
        "useTemplate": "warn",
        "noNonNullAssertion": "warn",
        "noParameterAssign": "error",
        "useAsConstAssertion": "error",
        "useDefaultParameterLast": "error",
        "useEnumInitializers": "error",
        "useSelfClosingElements": "error",
        "useSingleVarDeclarator": "error",
        "noUnusedTemplateLiteral": "error",
        "useNumberNamespace": "error",
        "noInferrableTypes": "error",
        "noUselessElse": "error"
      },
      "complexity": {
        "noForEach": "warn"
      },
      "a11y": {
        "useKeyWithClickEvents": "warn",
        "useAnchorContent": "warn",
        "useValidAnchor": "warn",
        "useButtonType": "warn",
        "noSvgWithoutTitle": "warn",
        "useAltText": "warn"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
