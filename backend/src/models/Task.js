/**
 * Task Model
 * Represents an AI processing task with status lifecycle management
 * Status flow: pending → running → success | failed
 */

const mongoose = require('mongoose');

const OPERATIONS = ['uppercase', 'lowercase', 'reverse', 'word_count'];
const STATUSES = ['pending', 'running', 'success', 'failed'];

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // fast lookup by user
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    inputText: {
      type: String,
      required: [true, 'Input text is required'],
      maxlength: [10000, 'Input text cannot exceed 10,000 characters'],
    },
    operation: {
      type: String,
      required: [true, 'Operation is required'],
      enum: {
        values: OPERATIONS,
        message: `Operation must be one of: ${OPERATIONS.join(', ')}`,
      },
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending',
      index: true, // filter by status efficiently
    },
    result: {
      type: mongoose.Schema.Types.Mixed, // string or number depending on operation
      default: null,
    },
    logs: [
      {
        timestamp: { type: Date, default: Date.now },
        message: { type: String },
        level: { type: String, enum: ['info', 'error', 'warn'], default: 'info' },
      },
    ],
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true },
  }
);

// Compound index: fetch all tasks for a user sorted by latest
taskSchema.index({ userId: 1, createdAt: -1 });

// Index for worker queue polling fallback
taskSchema.index({ status: 1, createdAt: 1 });

// Virtual: processing duration in ms
taskSchema.virtual('durationMs').get(function () {
  if (this.startedAt && this.completedAt) {
    return this.completedAt - this.startedAt;
  }
  return null;
});

module.exports = mongoose.model('Task', taskSchema);
module.exports.OPERATIONS = OPERATIONS;
