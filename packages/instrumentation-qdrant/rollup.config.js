const dts = require("rollup-plugin-dts");
const typescript = require("@rollup/plugin-typescript");
const json = require("@rollup/plugin-json");

const name = require("./package.json").main.replace(/\.js$/, "");

const bundle = (config) => ({
  ...config,
  input: "src/index.ts",
  external: (id) => !/^[./]/.test(id),
});

exports.default = [
  bundle({
    plugins: [typescript.default(), json.default()],
    output: [
      {
        file: `${name}.js`,
        format: "cjs",
        sourcemap: true,
      },
      {
        file: `${name}.mjs`,
        format: "es",
        sourcemap: true,
      },
    ],
  }),
  bundle({
    plugins: [dts.default()],
    output: {
      file: `${name}.d.ts`,
      format: "es",
    },
  }),
];
