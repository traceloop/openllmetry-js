# Image Generation Samples

This directory contains sample applications demonstrating OpenAI image generation with automatic Traceloop instrumentation.

## 🚀 Quick Start

### 1. Setup Environment Variables

Create a `.env` file in the `sample-app` directory:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# Required: OpenAI API Key for image generation
OPENAI_API_KEY=your_openai_key_here

# Optional: Traceloop API Key for tracing (recommended)
TRACELOOP_API_KEY=your_traceloop_key_here
```

### 2. Run the Samples

**Image Generation Sample** (with variations and error handling):
```bash
cd packages/sample-app
pnpm run:image_generation
```

## 📱 Available Samples

### `sample_openai_image_generation.ts`
- **Purpose**: Comprehensive TypeScript example with full feature demonstration
- **Features**: 
  - Image generation with DALL-E 3
  - Image variations
  - Error handling and validation
  - Detailed console output
  - Proper TypeScript types and null safety
- **Output**: Saves images as `otter.png` and `otter_variation.png`

## 🔍 What Gets Traced

When you run these samples with a valid `TRACELOOP_API_KEY`, you'll see traces in your Traceloop dashboard for:

- **Image Generation Spans**: `openai.images.generate`
  - Request attributes: model, prompt, size, quality, style
  - Response content: generated images (automatically uploaded)
  
- **Image Variation Spans**: `openai.images.createVariation`  
  - Input image processing and upload
  - Generated variation images

- **Image Edit Spans**: `openai.images.edit` (if used)
  - Input image and mask processing
  - Generated edited images

## 🛠️ API Keys

### OpenAI API Key
1. Sign up at [OpenAI](https://platform.openai.com)
2. Go to [API Keys](https://platform.openai.com/api-keys)
3. Create a new secret key
4. Add billing information (DALL-E requires paid account)

### Traceloop API Key (Optional)
1. Sign up at [Traceloop](https://app.traceloop.com)
2. Go to Settings → API Keys
3. Create a new API key
4. Copy the key to your `.env` file

## 🎨 Generated Images

The samples will create image files in the current directory:
- `otter.png` - Original generated image
- `otter_variation.png` - Variation of the original (full sample only)

## ⚠️ Notes

- **Costs**: DALL-E 3 image generation costs $0.040 per image
- **Rate Limits**: OpenAI has rate limits for image generation
- **Image Size**: Default size is 1024x1024 pixels
- **Format**: Images are saved as PNG files

## 🐛 Troubleshooting

**"Incorrect API key"**: Check your `OPENAI_API_KEY` in the `.env` file

**"Rate limit reached"**: Wait and try again later, or check your OpenAI usage limits

**"Insufficient quota"**: Add billing information to your OpenAI account

**No traces appearing**: Check your `TRACELOOP_API_KEY` and ensure it's valid