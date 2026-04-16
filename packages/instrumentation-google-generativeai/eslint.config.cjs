const js = require("@eslint/js");
const rootConfig = require("../../eslint.config.cjs");

const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = [
  {
    ignores: ["!**/*", "**/node_modules", "dist/**/*"],
  },
  ...rootConfig,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {},
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {},
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {},
  },
];
