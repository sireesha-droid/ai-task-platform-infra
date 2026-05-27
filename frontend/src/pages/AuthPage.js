import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AuthPage = ({ mode }) => {
  const { login, register, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const isLogin = mode === 'login';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    const fn = isLogin ? login : register;
    const result = await fn(email, password);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <div className="auth-title">
            AI<span style={{ color: 'var(--accent-blue)' }}>_</span>TASKS
          </div>
          <div className="auth-subtitle">
            {isLogin ? 'Sign in to your workspace' : 'Create a new account'}
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          <button
            className="btn btn-primary btn-full"
            type="submit"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? <><span className="spinner" /> Processing...</> : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {isLogin ? (
            <>No account? <Link to="/register">Register</Link></>
          ) : (
            <>Already have an account? <Link to="/login">Sign in</Link></>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
