# Contributing to OpenLLMetry-JS

Thanks for taking the time to contribute! 😃 🚀

Please refer to our [Contributing Guide](https://traceloop.com/docs/openllmetry/contributing/overview) for instructions on how to contribute.

## Releasing

To release a new version of the package, run (make sure you have access to the `@traceloop` npm organization):

```bash
nx run-many --targets=build
npx lerna publish --no-private
```
