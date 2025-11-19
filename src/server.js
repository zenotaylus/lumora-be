import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { rateOutfit, generateOutfitDescription, createImagePrompt } from './services/openaiService.js';
import { generateOutfitImage, generatePlaceholderImage } from './services/nanobananaService.js';
import {
  initializeDb,
  submitToArena,
  getAllSubmissions,
  getLeaderboard,
  likeSubmission,
  voteSubmission,
  getSubmissionById,
  getStats,
} from './db/fashionArena.js';
import { optimizeForMobile, base64ToBuffer, validateImage } from './utils/imageProcessor.js';
import { logInfo, logError, logRequest, logResponse } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || '*',
  credentials: false,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  logRequest(req);

  res.on('finish', () => {
    const duration = Date.now() - start;
    logResponse(req, res.statusCode, duration);
  });

  next();
});

// Store last generator params for regeneration
let lastGeneratorParams = null;

// Initialize Fashion Arena database
await initializeDb();

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    message: 'Lumora API is running',
  });
});

/**
 * Rate outfit endpoint
 */
app.post('/api/rate-outfit', async (req, res) => {
  try {
    const { image, occasion, budget } = req.body;

    if (!image || !occasion) {
      return res.status(400).json({
        success: false,
        error: 'Image and occasion are required',
      });
    }

    logInfo('Rating outfit', { occasion, hasBudget: !!budget });

    // Validate image
    try {
      const imageBuffer = base64ToBuffer(image);
      await validateImage(imageBuffer);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: `Invalid image: ${error.message}`,
      });
    }

    // Call OpenAI to rate outfit
    const rating = await rateOutfit(image, occasion, budget);

    logInfo('Outfit rated successfully', {
      wowFactor: rating.wow_factor,
      occasionFitness: rating.occasion_fitness,
      overallRating: rating.overall_rating,
    });

    res.json({
      success: true,
      data: rating,
    });
  } catch (error) {
    logError('Error rating outfit', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to rate outfit',
    });
  }
});

/**
 * Generate outfit endpoint
 */
app.post('/api/generate-outfit', async (req, res) => {
  try {
    const {
      user_image,
      wow_factor,
      brands,
      budget,
      occasion,
      conditions,
    } = req.body;

    if (!budget || !occasion) {
      return res.status(400).json({
        success: false,
        error: 'Budget and occasion are required',
      });
    }

    const wowFactor = wow_factor || 5;
    const brandsList = brands || [];

    logInfo('Generating outfit', {
      occasion,
      wowFactor,
      hasBudget: !!budget,
      hasUserImage: !!user_image,
    });

    // Store params for regeneration
    lastGeneratorParams = {
      user_image,
      wow_factor: wowFactor,
      brands: brandsList,
      budget,
      occasion,
      conditions,
    };

    // Validate user image if provided
    if (user_image) {
      try {
        const imageBuffer = base64ToBuffer(user_image);
        await validateImage(imageBuffer);
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: `Invalid user image: ${error.message}`,
        });
      }
    }

    // Step 1: Generate outfit description using GPT-4
    logInfo('Generating outfit description...');
    const outfitDescription = await generateOutfitDescription({
      wowFactor,
      brands: brandsList,
      budget,
      occasion,
      conditions,
    });

    logInfo('Outfit description generated');

    // Step 2: Generate image using NanobananaAPI
    let outfitImage = null;
    try {
      logInfo('Generating outfit visualization...');
      const imagePrompt = createImagePrompt(outfitDescription, occasion);
      outfitImage = await generateOutfitImage(user_image, imagePrompt, occasion);
      logInfo('Outfit visualization generated successfully');
    } catch (error) {
      logError('Failed to generate outfit image, using placeholder', error);
      // Generate placeholder image
      outfitImage = await generatePlaceholderImage(
        outfitDescription.outfit_concept || 'Your personalized outfit'
      );
    }

    res.json({
      success: true,
      outfit_description: outfitDescription,
      outfit_image_url: outfitImage,
    });
  } catch (error) {
    logError('Error generating outfit', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate outfit',
    });
  }
});

/**
 * Regenerate outfit endpoint
 */
app.post('/api/regenerate-outfit', async (req, res) => {
  try {
    if (!lastGeneratorParams) {
      return res.status(400).json({
        success: false,
        error: 'No previous generation found. Please generate an outfit first.',
      });
    }

    logInfo('Regenerating outfit with previous params');

    const {
      user_image,
      wow_factor,
      brands,
      budget,
      occasion,
      conditions,
    } = lastGeneratorParams;

    // Generate new outfit description
    logInfo('Generating new outfit description...');
    const outfitDescription = await generateOutfitDescription({
      wowFactor: wow_factor,
      brands,
      budget,
      occasion,
      conditions,
    });

    logInfo('New outfit description generated');

    // Generate new image
    let outfitImage = null;
    try {
      logInfo('Generating new outfit visualization...');
      const imagePrompt = createImagePrompt(outfitDescription, occasion);
      outfitImage = await generateOutfitImage(user_image, imagePrompt, occasion);
      logInfo('New outfit visualization generated successfully');
    } catch (error) {
      logError('Failed to generate outfit image, using placeholder', error);
      outfitImage = await generatePlaceholderImage(
        outfitDescription.outfit_concept || 'Your personalized outfit'
      );
    }

    res.json({
      success: true,
      outfit_description: outfitDescription,
      outfit_image_url: outfitImage,
    });
  } catch (error) {
    logError('Error regenerating outfit', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to regenerate outfit',
    });
  }
});

/**
 * Fashion Arena - Submit to arena
 */
app.post('/api/arena/submit', async (req, res) => {
  try {
    const { photo, title, description, occasion, source_mode, user_id } = req.body;

    if (!photo || !title || !occasion || !source_mode) {
      return res.status(400).json({
        success: false,
        error: 'Photo, title, occasion, and source_mode are required',
      });
    }

    logInfo('Submitting to Fashion Arena', { title, occasion, source_mode });

    const submission = await submitToArena({
      photo,
      title,
      description,
      occasion,
      source_mode,
      user_id,
    });

    logInfo('Submission created successfully', { id: submission.id });

    res.json({
      success: true,
      submission,
    });
  } catch (error) {
    logError('Error submitting to arena', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit to arena',
    });
  }
});

/**
 * Fashion Arena - Get submissions
 */
app.get('/api/arena/submissions', async (req, res) => {
  try {
    const { sort_by } = req.query;
    const sortBy = sort_by || 'recent';

    logInfo('Fetching arena submissions', { sortBy });

    const submissions = await getAllSubmissions(sortBy);

    res.json({
      success: true,
      submissions,
      total: submissions.length,
    });
  } catch (error) {
    logError('Error fetching submissions', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch submissions',
    });
  }
});

/**
 * Fashion Arena - Get leaderboard
 */
app.get('/api/arena/leaderboard', async (req, res) => {
  try {
    const { limit } = req.query;
    const limitNum = parseInt(limit) || 10;

    logInfo('Fetching leaderboard', { limit: limitNum });

    const leaderboard = await getLeaderboard(limitNum);

    res.json({
      success: true,
      leaderboard,
    });
  } catch (error) {
    logError('Error fetching leaderboard', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch leaderboard',
    });
  }
});

/**
 * Fashion Arena - Like submission
 */
app.post('/api/arena/like', async (req, res) => {
  try {
    const { submission_id, user_id } = req.body;

    if (!submission_id) {
      return res.status(400).json({
        success: false,
        error: 'submission_id is required',
      });
    }

    logInfo('Liking submission', { submission_id });

    const likes = await likeSubmission(submission_id, user_id);

    res.json({
      success: true,
      likes,
    });
  } catch (error) {
    logError('Error liking submission', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to like submission',
    });
  }
});

/**
 * Fashion Arena - Vote on submission
 */
app.post('/api/arena/vote', async (req, res) => {
  try {
    const { submission_id, voter_id, vote_type, rating } = req.body;

    if (!submission_id) {
      return res.status(400).json({
        success: false,
        error: 'submission_id is required',
      });
    }

    logInfo('Voting on submission', { submission_id, vote_type, rating });

    const submission = await voteSubmission(
      submission_id,
      voter_id || 'anonymous',
      vote_type || 'upvote',
      rating || 5
    );

    res.json({
      success: true,
      submission,
    });
  } catch (error) {
    logError('Error voting on submission', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to vote on submission',
    });
  }
});

/**
 * Fashion Arena - Get submission by ID
 */
app.get('/api/arena/submission/:id', async (req, res) => {
  try {
    const { id } = req.params;

    logInfo('Fetching submission', { id });

    const submission = await getSubmissionById(id);

    res.json({
      success: true,
      submission,
    });
  } catch (error) {
    logError('Error fetching submission', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch submission',
    });
  }
});

/**
 * Fashion Arena - Get statistics
 */
app.get('/api/arena/stats', async (req, res) => {
  try {
    logInfo('Fetching arena statistics');

    const stats = await getStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logError('Error fetching stats', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch statistics',
    });
  }
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logInfo(`Lumora API server running on port ${PORT}`);
  console.log(`\n🚀 Lumora API Server Started!`);
  console.log(`📍 Local:   http://localhost:${PORT}`);
  console.log(`📍 Network: http://10.10.11.212:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health\n`);
});
