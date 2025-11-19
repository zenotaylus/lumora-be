import sharp from 'sharp';

/**
 * Optimize image for processing
 * @param {Buffer} imageBuffer - Image buffer
 * @param {object} options - Optimization options
 * @returns {Promise<Buffer>} - Optimized image buffer
 */
export async function optimizeImage(imageBuffer, options = {}) {
  const {
    maxWidth = 1024,
    maxHeight = 1024,
    quality = 85,
    format = 'jpeg',
  } = options;

  try {
    let processor = sharp(imageBuffer);

    // Resize if needed
    processor = processor.resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Convert format and set quality
    if (format === 'jpeg') {
      processor = processor.jpeg({ quality });
    } else if (format === 'png') {
      processor = processor.png({ quality });
    } else if (format === 'webp') {
      processor = processor.webp({ quality });
    }

    return await processor.toBuffer();
  } catch (error) {
    console.error('Error optimizing image:', error);
    throw new Error(`Failed to optimize image: ${error.message}`);
  }
}

/**
 * Convert base64 to buffer
 * @param {string} base64String - Base64 encoded string (with or without data URL prefix)
 * @returns {Buffer} - Image buffer
 */
export function base64ToBuffer(base64String) {
  // Remove data URL prefix if present
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

/**
 * Convert buffer to base64 data URL
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimeType - MIME type (default: 'image/jpeg')
 * @returns {string} - Base64 data URL
 */
export function bufferToBase64(buffer, mimeType = 'image/jpeg') {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Validate image file
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<object>} - Image metadata
 */
export async function validateImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();

    // Check file size (max 10MB)
    if (buffer.length > 10 * 1024 * 1024) {
      throw new Error('Image file size exceeds 10MB limit');
    }

    // Check format
    const allowedFormats = ['jpeg', 'jpg', 'png', 'webp', 'heic'];
    if (!allowedFormats.includes(metadata.format)) {
      throw new Error(`Unsupported image format: ${metadata.format}`);
    }

    return metadata;
  } catch (error) {
    console.error('Error validating image:', error);
    throw new Error(`Invalid image file: ${error.message}`);
  }
}

/**
 * Optimize image for mobile display
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<string>} - Base64 data URL of optimized image
 */
export async function optimizeForMobile(imageBuffer) {
  try {
    const optimized = await sharp(imageBuffer)
      .resize(640, null, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    return bufferToBase64(optimized, 'image/jpeg');
  } catch (error) {
    console.error('Error optimizing for mobile:', error);
    throw new Error(`Failed to optimize for mobile: ${error.message}`);
  }
}
