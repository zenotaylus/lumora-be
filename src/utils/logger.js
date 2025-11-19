import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_DIR = path.join(__dirname, '..', '..', '..', 'logs');
const getLogFileName = () => {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  return `outfit_assistant_${date}.log`;
};

/**
 * Ensure log directory exists
 */
async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating log directory:', error);
  }
}

/**
 * Write log entry to file
 * @param {string} level - Log level (INFO, ERROR, WARN, DEBUG)
 * @param {string} message - Log message
 * @param {object} data - Additional data to log
 */
async function writeLog(level, message, data = {}) {
  await ensureLogDir();

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };

  const logLine = JSON.stringify(logEntry) + '\n';
  const logFile = path.join(LOG_DIR, getLogFileName());

  try {
    await fs.appendFile(logFile, logLine);
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
}

/**
 * Log info message
 */
export function logInfo(message, data = {}) {
  console.log(`[INFO] ${message}`, data);
  writeLog('INFO', message, data);
}

/**
 * Log error message
 */
export function logError(message, error = null, data = {}) {
  const errorData = error
    ? {
        ...data,
        error: error.message,
        stack: error.stack,
      }
    : data;

  console.error(`[ERROR] ${message}`, errorData);
  writeLog('ERROR', message, errorData);
}

/**
 * Log warning message
 */
export function logWarn(message, data = {}) {
  console.warn(`[WARN] ${message}`, data);
  writeLog('WARN', message, data);
}

/**
 * Log debug message
 */
export function logDebug(message, data = {}) {
  if (process.env.NODE_ENV === 'development' || process.env.FLASK_DEBUG === 'True') {
    console.log(`[DEBUG] ${message}`, data);
    writeLog('DEBUG', message, data);
  }
}

/**
 * Log API request
 */
export function logRequest(req) {
  const data = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };

  logInfo(`API Request: ${req.method} ${req.path}`, data);
}

/**
 * Log API response
 */
export function logResponse(req, statusCode, duration) {
  const data = {
    method: req.method,
    path: req.path,
    statusCode,
    duration: `${duration}ms`,
  };

  if (statusCode >= 400) {
    logError(`API Response: ${req.method} ${req.path} - ${statusCode}`, null, data);
  } else {
    logInfo(`API Response: ${req.method} ${req.path} - ${statusCode}`, data);
  }
}
