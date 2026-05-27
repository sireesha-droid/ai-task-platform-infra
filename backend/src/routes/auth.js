/**
 * Authentication Routes
 * POST /api/auth/register  - Create new account
 * POST /api/auth/login     - Sign in and get JWT
 */

const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../config/logger');

// ── Helpers ──────────────────────────────────────────────────────────────────

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const sendAuthResponse = (res, statusCode, user, token) => {
  res.status(statusCode).json({
    message: statusCode === 201 ? 'Account created successfully' : 'Login successful',
    token,
    user: {
      id: user._id,
      email: user.email,
      createdAt: user.createdAt,
    },
  });
};

// ── POST /register ────────────────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.create({ email, password });
    const token = signToken(user._id);

    logger.info(`New user registered: ${user.email}`);
    sendAuthResponse(res, 201, user, token);
  } catch (err) {
    next(err);
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Must explicitly select password since it's excluded by default
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      // Generic message to prevent user enumeration
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user._id);
    logger.info(`User logged in: ${user.email}`);
    sendAuthResponse(res, 200, user, token);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
