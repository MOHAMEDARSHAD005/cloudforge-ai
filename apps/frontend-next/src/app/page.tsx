'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nestStatus, setNestStatus] = useState<'checking' | 'healthy' | 'offline'>('checking');
  const [fastApiStatus, setFastApiStatus] = useState<'checking' | 'healthy' | 'offline'>('checking');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const nestRes = await fetch('http://localhost:3000/health');
        if (nestRes.ok) setNestStatus('healthy');
        else setNestStatus('offline');
      } catch {
        setNestStatus('offline');
      }

      try {
        const fastapiRes = await fetch('http://localhost:8000/health');
        if (fastapiRes.ok) setFastApiStatus('healthy');
        else setFastApiStatus('offline');
      } catch {
        setFastApiStatus('offline');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch('http://localhost:3000/api/v1/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || 'Failed to submit pipeline task');
      }

      const data = await response.json();
      // Redirect to the jobs routing view
      router.push(`/jobs/${data.jobId}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong. Make sure api-nest is online.';
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <div className="hero-card">
        <h1 className="hero-title">CloudForge AI</h1>
        <p className="hero-subtitle">
          An automated multi-agent pipeline simulating a Staff Software Engineering team to design, secure, and validate production AWS environments.
        </p>
      </div>

      <div className="form-container">
        <h2 className="form-title">Launch Core Agent Pipeline</h2>
        {error && (
          <div className="error-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <textarea
            className="text-area"
            placeholder="e.g. Build a school ERP for 50,000 users"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={submitting}
            required
          />
          <button type="submit" className="submit-btn" disabled={submitting || !prompt.trim()}>
            {submitting ? (
              <>
                <span className="spinner"></span>
                Enqueuing Job...
              </>
            ) : (
              'Generate Architecture'
            )}
          </button>
        </form>
      </div>

      <div className="status-grid">
        <div className="status-card">
          <div className="card-title">
            <span className="pulse-dot success"></span>
            frontend-next
          </div>
          <p className="card-desc">Next.js 14 Web UI dashboard interface for projects, status monitoring, and interactive diagrams.</p>
          <div className="status-badge success">Online</div>
        </div>

        <div className="status-card">
          <div className="card-title">
            <span className={`pulse-dot ${nestStatus === 'healthy' ? 'success' : 'warning'}`}></span>
            api-nest
          </div>
          <p className="card-desc">NestJS core orchestration engine managing Postgres models, JWT auth sessions, and jobs queues.</p>
          <div className={`status-badge ${nestStatus === 'healthy' ? 'success' : ''}`}>
            {nestStatus === 'checking' && 'Checking...'}
            {nestStatus === 'healthy' && 'Healthy'}
            {nestStatus === 'offline' && 'Offline / Dev'}
          </div>
        </div>

        <div className="status-card">
          <div className="card-title">
            <span className={`pulse-dot ${fastApiStatus === 'healthy' ? 'success' : 'warning'}`}></span>
            ai-fastapi
          </div>
          <p className="card-desc">FastAPI agent execution layer powered by Pydantic AI structured outputs and Claude reasoning.</p>
          <div className={`status-badge ${fastApiStatus === 'healthy' ? 'success' : ''}`}>
            {fastApiStatus === 'checking' && 'Checking...'}
            {fastApiStatus === 'healthy' && 'Healthy'}
            {fastApiStatus === 'offline' && 'Offline / Dev'}
          </div>
        </div>
      </div>
    </main>
  );
}
