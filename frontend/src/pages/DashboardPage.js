import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const OPERATIONS = [
  { value: 'uppercase',   label: 'Uppercase',    desc: 'Convert to UPPERCASE' },
  { value: 'lowercase',   label: 'Lowercase',    desc: 'Convert to lowercase' },
  { value: 'reverse',     label: 'Reverse',      desc: 'Reverse the string'   },
  { value: 'word_count',  label: 'Word Count',   desc: 'Count number of words' },
];

const StatusBadge = ({ status }) => (
  <span className={`badge badge-${status}`}>{status}</span>
);

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
};

// ─── Create Task Form ─────────────────────────────────────────────────────────
const CreateTaskForm = ({ onCreated }) => {
  const [title, setTitle] = useState('');
  const [inputText, setInputText] = useState('');
  const [operation, setOperation] = useState('uppercase');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (!title.trim() || !inputText.trim()) {
      setError('Title and input text are required');
      return;
    }

    setLoading(true);
    try {
      await api.post('/tasks', { title: title.trim(), inputText: inputText.trim(), operation });
      setSuccess('Task queued! Processing will begin shortly.');
      setTitle(''); setInputText(''); setOperation('uppercase');
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ fontSize: 16 }}>New Task</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
          Queue a new AI processing operation
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Task Title</label>
          <input
            className="form-input"
            placeholder="e.g. Process user feedback"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Operation</label>
          <select
            className="form-select"
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            {OPERATIONS.map(op => (
              <option key={op.value} value={op.value}>{op.label} — {op.desc}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Input Text</label>
          <textarea
            className="form-textarea"
            placeholder="Enter text to process..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            maxLength={10000}
            rows={5}
          />
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {inputText.length} / 10,000
          </div>
        </div>

        <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
          {loading ? <><span className="spinner" /> Queuing...</> : '▶ Queue Task'}
        </button>
      </form>
    </div>
  );
};

// ─── Task List ────────────────────────────────────────────────────────────────
const TaskList = ({ tasks, loading, onRefresh }) => {
  return (
    <div>
      <div className="section-header">
        <div className="section-title">Tasks</div>
        <button className="btn btn-ghost" onClick={onRefresh} disabled={loading} style={{ padding: '6px 14px' }}>
          {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '↻ Refresh'}
        </button>
      </div>

      {tasks.length === 0 && !loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">⬡</div>
          <div className="empty-state-text">No tasks yet. Create one to get started.</div>
        </div>
      ) : (
        <div className="task-grid">
          {tasks.map((task) => (
            <Link to={`/tasks/${task._id}`} key={task._id} className="task-item">
              <div className="task-item-left">
                <div className="task-item-title">{task.title}</div>
                <div className="task-item-meta">
                  <span className="op-chip">{task.operation}</span>
                  <span>{formatDate(task.createdAt)}</span>
                </div>
              </div>
              <StatusBadge status={task.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Dashboard Page ───────────────────────────────────────────────────────────
const DashboardPage = () => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const { data } = await api.get('/tasks');
      setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    // Auto-refresh every 8 seconds to pick up status changes
    const interval = setInterval(fetchTasks, 8000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  return (
    <div className="page-container">
      <nav className="navbar">
        <div className="navbar-brand">AI<span>_</span>TASKS</div>
        <div className="navbar-right">
          <span className="user-email">{user?.email}</span>
          <button className="btn btn-ghost" onClick={logout} style={{ padding: '6px 14px' }}>
            Sign Out
          </button>
        </div>
      </nav>

      <div className="main-content">
        <div className="dashboard-grid">
          <CreateTaskForm onCreated={fetchTasks} />
          <TaskList tasks={tasks} loading={loadingTasks} onRefresh={fetchTasks} />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
