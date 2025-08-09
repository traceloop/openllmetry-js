/**
 * Basic test script to verify image generation instrumentation works
 * This is a simple functional test, not a unit test
 */

const { initialize } = require('@traceloop/node-server-sdk');
const OpenAI = require('openai');

async function testImageGenerationInstrumentation() {
  console.log('🧪 Testing Image Generation Instrumentation...\n');

  // Initialize Traceloop (this will set up the image upload callback)
  initialize({
    appName: 'test-image-generation',
    apiKey: process.env.TRACELOOP_API_KEY || 'test-key',
    baseUrl: process.env.TRACELOOP_BASE_URL || 'https://api.traceloop.com',
    disableBatch: true, // For immediate testing
  });

  console.log('✅ Traceloop initialized with image support');

  // Create OpenAI client
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'test-key',
  });

  console.log('✅ OpenAI client created');

  try {
    // Test 1: Image Generation (this will be instrumented)
    console.log('\n📸 Testing image generation instrumentation...');
    
    // This will trigger our instrumentation
    console.log('Calling client.images.generate() - this should be instrumented');
    
    // Note: This will fail without a real API key, but the instrumentation should still trigger
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: 'A cute cat wearing a hat',
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
    });

    console.log('✅ Image generation completed:', response.data[0]?.url || 'No URL returned');
    
  } catch (error) {
    // Expected if no valid API key
    console.log('⚠️ Expected API error (instrumentation should still work):', error.message);
    
    if (error.message.includes('Incorrect API key') || error.message.includes('authentication')) {
      console.log('✅ This error is expected without a valid OpenAI API key');
    }
  }

  try {
    // Test 2: Image Edit (this will be instrumented)
    console.log('\n🖼️ Testing image edit instrumentation...');
    
    console.log('Calling client.images.edit() - this should be instrumented');
    
    // Create a simple test image buffer (1x1 pixel PNG)
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x00, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x01, 0x02, 0x15, 0x07, 0x9A, 0x5E, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);

    const response = await client.images.edit({
      image: testImageBuffer,
      prompt: 'Add a red hat to this image',
      n: 1,
      size: '1024x1024',
    });

    console.log('✅ Image edit completed:', response.data[0]?.url || 'No URL returned');
    
  } catch (error) {
    console.log('⚠️ Expected API error (instrumentation should still work):', error.message);
    
    if (error.message.includes('Incorrect API key') || error.message.includes('authentication')) {
      console.log('✅ This error is expected without a valid OpenAI API key');
    }
  }

  console.log('\n🎉 Image generation instrumentation test completed!');
  console.log('📋 Check your Traceloop dashboard for image generation spans');
  console.log('🔍 Look for spans with names like "openai.images.generate" and "openai.images.edit"');
  
  // Give some time for spans to be exported
  setTimeout(() => {
    console.log('\n⏱️ Waiting for spans to be exported...');
    process.exit(0);
  }, 2000);
}

// Handle any uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
testImageGenerationInstrumentation().catch(console.error);