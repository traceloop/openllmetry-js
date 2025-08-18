# OpenTelemetry v1 Compatible Branch

This branch (`otel-v1-main`) contains a version of the OpenLLMetry JS SDK that is compatible with OpenTelemetry JavaScript SDK v1.30.1 and earlier versions.

## What's Different

### OpenTelemetry Dependency Versions

- **@opentelemetry/api**: `^1.7.0` (downgraded from `^1.9.0`)
- **@opentelemetry/core**: `^1.30.1` (downgraded from `^2.0.1`)
- **@opentelemetry/resources**: `^1.30.1` (downgraded from `^2.0.0`)
- **@opentelemetry/sdk-trace-base**: `^1.30.1` (downgraded from `^2.0.0`)
- **@opentelemetry/instrumentation**: `^0.48.0` (downgraded from `^0.203.0`)
- **@opentelemetry/sdk-node**: `^0.48.0` (downgraded from `^0.203.0`)

### Code Changes Made for v1 Compatibility

1. **TypeScript Interface Updates**: Fixed `InstrumentationModuleDefinition` generic type parameters across all instrumentation packages
2. **SDK Configuration**: Updated `NodeSDK` configuration to use `spanProcessor` (singular) instead of `spanProcessors` (plural) as required by v1.x
3. **API Version Compatibility**: Ensured all packages use compatible API versions

## Release Strategy

### Automated Releases

The branch has its own GitHub Actions workflow (`.github/workflows/release-otel-v1.yml`) that:

- Triggers on pushes to `otel-v1-main` branch
- Automatically adds `-otel-v1` suffix to version numbers
- Publishes to npm with `otel-v1` dist-tag
- Creates GitHub releases with appropriate tagging

### Version Naming Convention

- Main branch releases: `0.16.2`, `0.17.0`, etc.
- OTel v1 branch releases: `0.16.2-otel-v1`, `0.17.0-otel-v1`, etc.

### Installation for End Users

**For users on OpenTelemetry v2.x (latest):**

```bash
npm install @traceloop/node-server-sdk
```

**For users on OpenTelemetry v1.x:**

```bash
npm install @traceloop/node-server-sdk@otel-v1
```

## Maintenance

### Syncing Changes from Main

To keep this branch up-to-date with the main branch:

1. **Merge main branch changes:**

   ```bash
   git checkout otel-v1-main
   git merge main
   ```

2. **Resolve any conflicts** related to OpenTelemetry dependencies
3. **Test the build** to ensure v1 compatibility is maintained
4. **Push changes** to trigger automated release

### Testing

Before releasing, ensure:

1. All instrumentation packages build successfully
2. The main SDK package compiles (may have some remaining type issues with complex scenarios)
3. Basic functionality works with OpenTelemetry v1.x setups

## Troubleshooting

### Common Issues

1. **Type Compatibility Errors**: The v1.x OpenTelemetry packages have different TypeScript interfaces. Most have been fixed, but complex scenarios may still have issues.

2. **Peer Dependency Warnings**: Some peer dependency warnings are expected due to the version differences between packages.

3. **Build Failures**: If new features from main use v2.x-only APIs, they'll need to be adapted or conditionally compiled for v1 compatibility.

### Getting Help

For issues specific to the OpenTelemetry v1 branch, please:

1. Check if the issue exists in the main branch
2. Verify OpenTelemetry version compatibility
3. Open issues with `[otel-v1]` prefix in the title
