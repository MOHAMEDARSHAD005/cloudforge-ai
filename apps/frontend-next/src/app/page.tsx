'use client';

import React, { useState, useEffect } from 'react';

export default function Home() {
  const [nestStatus, setNestStatus] = useState<'checking' | 'healthy' | 'offline'>('checking');
  const [fastApiStatus, setFastApiStatus] = useState<'checking' | 'healthy' | 'offline'>('checking');

  useEffect(() => {
    // Health check logic (simulated in frontend, or hitting local APIs if running)
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

  return (
    <main>
      <div className="hero-card">
        <h1 className="hero-title">CloudForge AI</h1>
        <p className="hero-subtitle">
          An automated multi-agent pipeline simulating a Staff Software Engineering team to design, secure, and validate production AWS environments.
        </p>
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
