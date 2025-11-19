import axios from 'axios';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const NANOBANANA_API_KEY = process.env.NANOBANANA_API_KEY;

/**
 * Generate outfit image using NanobananaAPI (text-to-image mode only)
 * @param {string} userImageBase64 - Optional user image (not used, kept for API compatibility)
 * @param {string} prompt - Image generation prompt
 * @param {string} occasion - Occasion for background
 * @returns {Promise<string>} - Base64 encoded generated image
 */
export async function generateOutfitImage(userImageBase64, prompt, occasion) {
  try {
    console.log('Generating outfit image using NanobananaAPI text-to-image mode...');

    // Prepare request to NanobananaAPI (always use text-to-image)
    const requestBody = {
      type: 'TEXTTOIMAGE',
      prompt: prompt,
      image_size: '3:4', // Portrait orientation
      num_images: 1,
    };

    console.log('Submitting to NanobananaAPI with prompt:', prompt.substring(0, 100) + '...');
    const response = await axios.post(
      'https://api.nanobanana.ai/api/v1/nanobanana/generate',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${NANOBANANA_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const taskId = response.data.task_id;
    console.log('Task ID:', taskId);

    // Poll for completion
    const maxAttempts = 60; // 2 minutes max (2 second intervals)
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds

      const statusResponse = await axios.get(
        `https://api.nanobanana.ai/api/v1/nanobanana/task/${taskId}`,
        {
          headers: {
            'Authorization': `Bearer ${NANOBANANA_API_KEY}`,
          },
        }
      );

      const status = statusResponse.data.status;
      console.log(`Task status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);

      if (status === 'completed') {
        const imageUrl = statusResponse.data.result.images[0];
        console.log('Generation completed! Downloading image from:', imageUrl);

        // Download the generated image
        const imageResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
        });

        // Optimize the image
        const optimizedBuffer = await sharp(imageResponse.data)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        // Convert to base64
        const base64Image = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
        console.log('Image successfully generated and optimized');
        return base64Image;
      } else if (status === 'failed') {
        throw new Error('Image generation failed');
      }

      attempts++;
    }

    throw new Error('Image generation timed out');
  } catch (error) {
    console.error('Error generating outfit image:', error.response?.data || error.message);
    throw new Error(`Failed to generate outfit image: ${error.message}`);
  }
}

/**
 * Generate a simple placeholder image if API fails
 * @param {string} outfitDescription - Description to put on image
 * @returns {Promise<string>} - Base64 encoded placeholder image
 */
export async function generatePlaceholderImage(outfitDescription) {
  try {
    console.log('Generating placeholder image...');

    // Create a simple solid color placeholder
    const width = 800;
    const height = 1000;

    const buffer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 102, g: 126, b: 234, alpha: 1 }
      }
    })
    .jpeg({ quality: 85 })
    .toBuffer();

    const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    console.log('Placeholder image generated successfully, size:', base64.length);
    return base64;
  } catch (error) {
    console.error('Error generating placeholder:', error);
    // Return a minimal base64 image as absolute fallback
    // This is a tiny 1x1 purple pixel
    return 'data:image/gif;base64,R0lGODlhAQABAPAAAGZ+6gAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';
  }
}
