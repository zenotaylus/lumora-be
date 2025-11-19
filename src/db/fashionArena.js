import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'fashion_arena_db.json');

/**
 * Load database from JSON file
 * @returns {Promise<object>} - Database object
 */
async function loadDb() {
  try {
    const data = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty database
    if (error.code === 'ENOENT') {
      return {
        submissions: [],
        votes: {},
      };
    }
    throw error;
  }
}

/**
 * Save database to JSON file
 * @param {object} db - Database object
 */
async function saveDb(db) {
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

/**
 * Initialize database if it doesn't exist
 */
export async function initializeDb() {
  try {
    await fs.access(DB_PATH);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await saveDb({ submissions: [], votes: {} });
      console.log('Fashion Arena database initialized');
    }
  }
}

/**
 * Submit outfit to Fashion Arena
 * @param {object} submission - Submission data
 * @returns {Promise<object>} - Created submission with ID
 */
export async function submitToArena(submission) {
  const db = await loadDb();

  const newSubmission = {
    id: uuidv4(),
    photo: submission.photo,
    title: submission.title,
    description: submission.description || '',
    occasion: submission.occasion,
    source_mode: submission.source_mode, // 'rater' or 'generator'
    user_id: submission.user_id || 'anonymous',
    created_at: new Date().toISOString(),
    total_votes: 0,
    total_rating: 0,
    vote_count: 0,
    average_rating: 0,
    likes: 0,
  };

  db.submissions.push(newSubmission);
  await saveDb(db);

  return newSubmission;
}

/**
 * Get all submissions with optional sorting
 * @param {string} sortBy - Sort option: 'recent', 'top_voted', 'top_rated'
 * @returns {Promise<Array>} - Array of submissions
 */
export async function getAllSubmissions(sortBy = 'recent') {
  const db = await loadDb();
  let submissions = [...db.submissions];

  switch (sortBy) {
    case 'top_voted':
      submissions.sort((a, b) => b.likes - a.likes);
      break;
    case 'top_rated':
      submissions.sort((a, b) => b.average_rating - a.average_rating);
      break;
    case 'recent':
    default:
      submissions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
  }

  return submissions;
}

/**
 * Get leaderboard (top submissions by likes)
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Array>} - Top submissions
 */
export async function getLeaderboard(limit = 10) {
  const db = await loadDb();
  const submissions = [...db.submissions];

  submissions.sort((a, b) => b.likes - a.likes);

  return submissions.slice(0, limit);
}

/**
 * Like a submission (Instagram-style)
 * @param {string} submissionId - Submission ID
 * @param {string} userId - User ID (optional, defaults to 'anonymous')
 * @returns {Promise<number>} - New like count
 */
export async function likeSubmission(submissionId, userId = 'anonymous') {
  const db = await loadDb();

  const submission = db.submissions.find((s) => s.id === submissionId);

  if (!submission) {
    throw new Error('Submission not found');
  }

  // Increment likes (in production, would check if user already liked)
  submission.likes = (submission.likes || 0) + 1;

  await saveDb(db);

  return submission.likes;
}

/**
 * Vote on a submission with a rating
 * @param {string} submissionId - Submission ID
 * @param {string} voterId - Voter ID
 * @param {string} voteType - 'upvote' or 'downvote'
 * @param {number} rating - Rating value (1-10)
 * @returns {Promise<object>} - Updated submission
 */
export async function voteSubmission(submissionId, voterId = 'anonymous', voteType = 'upvote', rating = 5) {
  const db = await loadDb();

  const submission = db.submissions.find((s) => s.id === submissionId);

  if (!submission) {
    throw new Error('Submission not found');
  }

  const voteKey = `${submissionId}_${voterId}`;

  // Check if already voted
  if (!db.votes[voteKey]) {
    // New vote
    db.votes[voteKey] = {
      submission_id: submissionId,
      voter_id: voterId,
      vote_type: voteType,
      rating: rating,
      voted_at: new Date().toISOString(),
    };

    submission.total_votes += voteType === 'upvote' ? 1 : -1;
    submission.total_rating += rating;
    submission.vote_count += 1;
    submission.average_rating = submission.total_rating / submission.vote_count;
  } else {
    // Update existing vote
    const oldVote = db.votes[voteKey];
    submission.total_votes += voteType === 'upvote' ? 1 : -1;
    submission.total_votes -= oldVote.vote_type === 'upvote' ? 1 : -1;
    submission.total_rating -= oldVote.rating;
    submission.total_rating += rating;
    submission.average_rating = submission.total_rating / submission.vote_count;

    db.votes[voteKey] = {
      ...oldVote,
      vote_type: voteType,
      rating: rating,
      voted_at: new Date().toISOString(),
    };
  }

  await saveDb(db);

  return submission;
}

/**
 * Get submission by ID
 * @param {string} submissionId - Submission ID
 * @returns {Promise<object>} - Submission object
 */
export async function getSubmissionById(submissionId) {
  const db = await loadDb();
  const submission = db.submissions.find((s) => s.id === submissionId);

  if (!submission) {
    throw new Error('Submission not found');
  }

  return submission;
}

/**
 * Get Fashion Arena statistics
 * @returns {Promise<object>} - Statistics object
 */
export async function getStats() {
  const db = await loadDb();

  const totalSubmissions = db.submissions.length;
  const totalVotes = Object.keys(db.votes).length;
  const totalLikes = db.submissions.reduce((sum, s) => sum + (s.likes || 0), 0);

  const ratingsSum = db.submissions.reduce((sum, s) => sum + (s.total_rating || 0), 0);
  const ratingsCount = db.submissions.reduce((sum, s) => sum + (s.vote_count || 0), 0);
  const avgRatingOverall = ratingsCount > 0 ? ratingsSum / ratingsCount : 0;

  return {
    total_submissions: totalSubmissions,
    total_votes: totalVotes,
    total_likes: totalLikes,
    avg_rating_overall: avgRatingOverall,
  };
}
