#!/usr/bin/env node

/**
 * Development runner that ensures proper build order for workspace dependencies
 * This ensures that when we make changes to instrumentation or SDK packages,
 * the sample-app gets the latest builds.
 */

const { execSync } = require('child_process');
const path = require('path');

function run(command, options = {}) {
  console.log(`🔧 Running: ${command}`);
  try {
    execSync(command, { 
      stdio: 'inherit', 
      cwd: path.resolve(__dirname),
      ...options 
    });
  } catch (error) {
    console.error(`❌ Command failed: ${command}`);
    process.exit(1);
  }
}

function main() {
  console.log('🚀 Development Build & Run for OpenLLMetry JS');
  console.log('================================================');
  
  // Step 1: Build dependencies using nx (handles dependency order)
  console.log('\n📦 Step 1: Building dependencies with nx...');
  run('pnpm nx run-many --targets=build --projects=@traceloop/instrumentation-openai,@traceloop/node-server-sdk');
  
  // Step 2: Build and run sample app
  console.log('\n🏃 Step 2: Building and running sample app...');
  run('pnpm --filter sample-app run:image_generation');
  
  console.log('\n✅ Development run completed successfully!');
}

if (require.main === module) {
  main();
}