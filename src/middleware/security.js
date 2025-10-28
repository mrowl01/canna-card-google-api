const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const xss = require('xss');
const logger = require('../utils/logger');

// Security Headers Middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net"
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Allow inline scripts for admin dashboard
        "https://cdn.jsdelivr.net"
      ],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc)
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        "https://pay.google.com",
        "https://walletobjects.googleapis.com",
        "https://kmbglmxczgsmtkdsniym.supabase.co"
      ],
      fontSrc: [
        "'self'",
        "https://cdn.jsdelivr.net"
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// CORS Configuration - Production Locked Down
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Production-only allowed origins
    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? [
          'https://canna-card-front-end-omega.vercel.app',
          'https://pay.google.com',
          'https://walletobjects.googleapis.com'
        ]
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'https://canna-card-front-end-omega.vercel.app',
          'https://pay.google.com',
          'https://walletobjects.googleapis.com'
        ];

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.logSecurityEvent('CORS_BLOCKED', { origin, allowedOrigins, ip: 'unknown' });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining']
};

// Rate Limiting Configuration
const createRateLimit = (windowMs, max, message, skipSuccessfulRequests = false) => {
  return rateLimit({
    windowMs: windowMs,
    max: max,
    message: {
      error: 'Too many requests',
      message: message,
      retryAfter: Math.ceil(windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: skipSuccessfulRequests,
    handler: (req, res) => {
      logger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent')
      });
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        message: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Different rate limits for different endpoints
const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  'Too many requests from this IP, please try again in 15 minutes'
);

const authRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  10, // limit each IP to 10 auth requests per windowMs
  'Too many authentication attempts, please try again in 15 minutes'
);

const notificationRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  300, // limit each IP to 300 notification requests per hour
  'Too many notification requests, please try again in 1 hour'
);

// Input Sanitization Middleware
const sanitizeInput = (req, res, next) => {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    next();
  } catch (error) {
    logger.error('Input Sanitization Error', {
      error: error.message,
      path: req.path,
      ip: req.ip
    });
    res.status(400).json({
      success: false,
      error: 'Invalid input format',
      message: 'Request contains invalid or malicious content'
    });
  }
};

// Recursively sanitize object properties
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Remove XSS and sanitize
    return xss(obj, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script']
    }).trim();
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key names too
      const cleanKey = xss(key, { whiteList: {}, stripIgnoreTag: true });
      sanitized[cleanKey] = sanitizeObject(value);
    }
    return sanitized;
  }

  return obj;
};

// Validation Error Handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));

    logger.logSecurityEvent('VALIDATION_FAILED', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      errors: errorDetails
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      message: 'Request contains invalid data',
      details: errorDetails
    });
  }
  next();
};

// Common Validation Rules
const validationRules = {
  userId: param('userId')
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('User ID must be 1-50 characters and contain only letters, numbers, dots, underscores, and hyphens'),

  objectId: param('objectId')
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Object ID must be 1-100 characters and contain only letters, numbers, dots, underscores, and hyphens'),

  points: body('points')
    .isInt({ min: 1, max: 999999 })
    .withMessage('Points must be an integer between 1 and 999,999'),

  pointsDelta: body('pointsDelta')
    .isInt({ min: -999999, max: 999999 })
    .withMessage('Points delta must be an integer between -999,999 and 999,999'),

  reason: body('reason')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Reason must be 1-200 characters'),

  notificationType: body('type')
    .optional()
    .isIn(['POINTS_EARNED', 'POINTS_REDEEMED', 'TIER_UPGRADE', 'WELCOME', 'CUSTOM', 'TRANSFER_RECEIVED', 'BALANCE_UPDATE'])
    .withMessage('Invalid notification type'),

  userIds: body('userIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('User IDs must be an array with 1-100 items')
    .custom((userIds) => {
      if (!userIds.every(id => typeof id === 'string' && /^[a-zA-Z0-9._-]+$/.test(id))) {
        throw new Error('All user IDs must be valid strings');
      }
      return true;
    }),

  classData: [
    body('programName')
      .isLength({ min: 1, max: 50 })
      .withMessage('Program name must be 1-50 characters'),
    body('logoUrl')
      .optional()
      .isURL()
      .withMessage('Logo URL must be a valid URL'),
    body('colors.primary')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Primary color must be a valid hex color'),
    body('colors.secondary')
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('Secondary color must be a valid hex color')
  ],

  transferPoints: [
    body('fromUserId')
      .isLength({ min: 1, max: 50 })
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage('From User ID must be valid'),
    body('toUserId')
      .isLength({ min: 1, max: 50 })
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage('To User ID must be valid'),
    body('points')
      .isInt({ min: 1, max: 999999 })
      .withMessage('Points must be an integer between 1 and 999,999')
  ]
};

// API Key Validation
const validateApiKey = (req, res, next) => {
  // Only health check is public - everything else requires authentication
  const publicEndpoints = ['/health'];
  if (publicEndpoints.includes(req.path)) {
    return next();
  }

  // Get API key from header
  const apiKey = req.headers['x-api-key'] ||
                 (req.headers['authorization'] && req.headers['authorization'].replace('Bearer ', ''));

  // In production, require API key
  if (process.env.NODE_ENV === 'production') {
    if (!apiKey) {
      logger.logSecurityEvent('API_KEY_MISSING', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'You are not authorized. Contact admin.'
      });
    }

    // Validate API key
    const validApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',').map(k => k.trim()) : [];

    if (validApiKeys.length === 0) {
      logger.error('No API keys configured in environment variables');
      return res.status(500).json({
        success: false,
        error: 'Server misconfiguration',
        message: 'API authentication not properly configured'
      });
    }

    if (!validApiKeys.includes(apiKey)) {
      logger.logSecurityEvent('API_KEY_INVALID', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        apiKeyPrefix: apiKey.substring(0, 8) + '...',
        userAgent: req.get('User-Agent')
      });

      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You are not authorized. Contact admin.'
      });
    }

    // Valid API key
    logger.info('Authenticated request', {
      path: req.path,
      method: req.method,
      apiKeyPrefix: apiKey.substring(0, 8) + '...'
    });
  }

  next();
};

// Request Logging Middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const path = req.path;
    const ip = req.ip;

    const logLevel = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
    console.log(`${logLevel} ${method} ${path} ${status} ${duration}ms ${ip}`);
  });

  next();
};

module.exports = {
  // Middleware functions
  securityHeaders,
  cors: cors(corsOptions),
  generalRateLimit,
  authRateLimit,
  notificationRateLimit,
  sanitizeInput,
  handleValidationErrors,
  validateApiKey,
  requestLogger,

  // Validation rules
  validationRules,

  // Utility functions
  sanitizeObject
};