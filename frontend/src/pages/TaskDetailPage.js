import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
};

const StatusBadge = ({ status }) => (
  <span className={`badge badge-${status}`}>{status}</span>
);

const LogLevel = ({ level }) => {
  const colors = { info: 'var(--accent-blue)', error: 'var(--accent-red)', warn: 'var(--accent-amber)' };
  return <span className="log-lvl" style={{ color: colors[level] || 'var(--text-muted)' }}>{level}</span>;
};

const TaskDetailPage = () => {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTask = useCallback(async () => {
    try {
      const { data } = await api.get(`/tasks/${id}`);
      setTask(data.task);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTask();
    // Poll if task is not in terminal state
    const interval = setInterval(() => {
      if (task && (task.status === 'success' || task.status === 'failed')) return;
      fetchTask();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchTask, task?.status]);

  const renderResult = () => {
    if (!task || task.status !== 'success') return null;
    const result = task.result;

    if (task.operation === 'word_count') {
      return (
        <div>
          <div className="section-label">Result</div>
          <div className="result-number">{result}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>words counted</div>
        </div>
      );
    }

    return (
      <div>
        <div className="section-label">Result</div>
        <div className="result-block" style={{ color: 'var(--accent-green)' }}>
          {result}
        </div>
      </div>
    );
  };

  return (
    <div className="page-container">
      <nav className="navbar">
        <div className="navbar-brand">AI<span style={{ color: 'var(--accent-blue)' }}>_</span>TASKS</div>
        <div className="navbar-right">
          <span className="user-email">{user?.email}</span>
          <button className="btn btn-ghost" onClick={logout} style={{ padding: '6px 14px' }}>
            Sign Out
          </button>
        </div>
      </nav>

      <div className="main-content" style={{ maxWidth: 800 }}>
        <div style={{ marginBottom: 20 }}>
          <Link to="/dashboard" className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 12 }}>
            ← Back to Dashboard
          </Link>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <span className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        {task && (
          <div className="card">
            {/* Header */}
            <div className="detail-header">
              <div className="detail-title">{task.title}</div>
              <StatusBadge status={task.status} />
            </div>

            {/* Meta Grid */}
            <div className="meta-grid">
              <div className="meta-item">
                <div className="meta-label">Operation</div>
                <div className="meta-value"><span className="op-chip">{task.operation}</span></div>
              </div>
              <div className="meta-item">
                <div className="meta-label">Created</div>
                <div className="meta-value">{formatDate(task.createdAt)}</div>
              </div>
              {task.startedAt && (
                <div className="meta-item">
                  <div className="meta-label">Started</div>
                  <div className="meta-value">{formatDate(task.startedAt)}</div>
                </div>
              )}
              {task.completedAt && (
                <div className="meta-item">
                  <div className="meta-label">Completed</div>
                  <div className="meta-value">{formatDate(task.completedAt)}</div>
                </div>
              )}
              {task.durationMs && (
                <div className="meta-item">
                  <div className="meta-label">Duration</div>
                  <div className="meta-value">{task.durationMs}ms</div>
                </div>
              )}
            </div>

            <hr className="divider" />

            {/* Input */}
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">Input Text</div>
              <div className="result-block" style={{ color: 'var(--text-secondary)' }}>
                {task.inputText}
              </div>
            </div>

            {/* Result */}
            {renderResult() && (
              <>
                {renderResult()}
                <hr className="divider" />
              </>
            )}

            {/* Error */}
            {task.status === 'failed' && task.errorMessage && (
              <div className="alert alert-error" style={{ marginBottom: 24 }}>
                <strong>Error:</strong> {task.errorMessage}
              </div>
            )}

            {/* Logs */}
            {task.logs && task.logs.length > 0 && (
              <div>
                <div className="section-label">Processing Logs</div>
                <div className="log-list">
                  {task.logs.map((log, i) => (
                    <div key={i} className={`log-entry ${log.level}`}>
                      <span className="log-ts">{formatDate(log.timestamp)}</span>
                      <LogLevel level={log.level} />
                      <span className="log-msg">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Running state */}
            {task.status === 'running' && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--accent-cyan)', fontSize: 13 }}>
                <span className="spinner" style={{ marginRight: 8 }} />
                Processing... auto-refreshing
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskDetailPage;
