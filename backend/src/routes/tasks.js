/**
 * Task Routes
 * POST   /api/tasks       - Create a new task and enqueue it
 * GET    /api/tasks       - List all tasks for the current user
 * GET    /api/tasks/:id   - Get task details including result and logs
 */

const router = require('express').Router();
const Task = require('../models/Task');
const authenticate = require('../middleware/auth');
const { getRedisClient } = require('../config/redis');
const logger = require('../config/logger');

const REDIS_QUEUE_KEY = 'tasks:queue';

// All task routes require authentication
router.use(authenticate);

// ── POST /tasks ───────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { title, inputText, operation } = req.body;

    if (!title || !inputText || !operation) {
      return res.status(400).json({ error: 'title, inputText, and operation are required' });
    }

    // Create task in DB (status: pending)
    const task = await Task.create({
      userId: req.user._id,
      title,
      inputText,
      operation,
      status: 'pending',
      logs: [{ message: 'Task created and queued for processing', level: 'info' }],
    });

    // Enqueue task ID to Redis for the Python worker to pick up
    const redis = getRedisClient();
    await redis.rpush(REDIS_QUEUE_KEY, task._id.toString());

    logger.info(`Task ${task._id} enqueued by user ${req.user._id}`);

    res.status(201).json({
      message: 'Task created and queued for processing',
      task: {
        id: task._id,
        title: task.title,
        operation: task.operation,
        status: task.status,
        createdAt: task.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /tasks ────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      Task.find({ userId: req.user._id })
        .select('-logs -inputText') // exclude heavy fields in list view
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments({ userId: req.user._id }),
    ]);

    res.json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /tasks/:id ────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.user._id, // ensure ownership
    }).lean();

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
