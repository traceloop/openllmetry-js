const nx = require("@nx/eslint-plugin");
const globals = require("globals");
const js = require("@eslint/js");

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = [
  {
    plugins: {
      "@nx": nx,
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],

    rules: {
      "@nx/enforce-module-boundaries": [
        "error",
        {
          enforceBuildableLibDependency: true,
          allow: [],

          depConstraints: [
            {
              sourceTag: "*",
              onlyDependOnLibsWithTags: ["*"],
            },
          ],
        },
      ],
    },
  },
  ...compat.extends("plugin:@nx/typescript").map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],

    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  ...compat.extends("plugin:@nx/javascript").map((config) => ({
    ...config,
    files: ["**/*.js", "**/*.jsx"],
  })),
  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {},
  },
  {
    files: ["**/*.spec.ts", "**/*.spec.tsx", "**/*.spec.js", "**/*.spec.jsx"],

    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },

    rules: {},
  },
];
