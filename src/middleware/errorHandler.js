import { logError } from '../utils/logger.js';

/**
 * Global error handling middleware
 */
export function errorHandler(err, req, res, next) {
  logError('Unhandled error', err, {
    path: req.path,
    method: req.method,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
}
