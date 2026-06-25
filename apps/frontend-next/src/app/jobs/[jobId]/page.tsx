'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useJobSocket } from '../../../hooks/useJobSocket';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const { connected, jobEvents, jobState, projectState, loading, error } = useJobSocket(jobId);
  const [activeTab, setActiveTab] = useState<'PLAN' | 'ARCHITECTURE' | 'AWS_ARCHITECTURE'>('PLAN');

  // Helper to determine agent status
  const getAgentStatus = (agent: string) => {
    const events = jobEvents.filter((e) => e.agent === agent);
    const hasFailed = events.some((e) => e.event === 'agent:failed');
    const hasCompleted = events.some((e) => e.event === 'agent:complete');
    const hasStarted = events.some((e) => e.event === 'agent:started');

    if (hasFailed) return 'FAILED';
    if (hasCompleted) return 'COMPLETE';
    if (hasStarted) return 'RUNNING';
    return 'PENDING';
  };

  // Helper to get agent metrics (duration and token usage)
  const getAgentMetrics = (agent: string) => {
    const completeEvent = jobEvents.find((e) => e.agent === agent && e.event === 'agent:complete');
    if (!completeEvent || !completeEvent.payload) return null;

    const payload = completeEvent.payload;
    const durationMs = payload.durationMs || 0;
    const tokenUsage = payload.tokenUsage || { input: 0, output: 0 };
    
    // Derived USD cost logic
    let costUsd = 0;
    const model = (payload.payload?.model_name || 'claude-sonnet-4-6').toLowerCase();
    const inputRate = model.includes('haiku') ? 0.8 / 1000000 : 3.0 / 1000000;
    const outputRate = model.includes('haiku') ? 4.0 / 1000000 : 15.0 / 1000000;
    costUsd = (tokenUsage.input * inputRate) + (tokenUsage.output * outputRate);

    return {
      durationSec: (durationMs / 1000).toFixed(1),
      tokens: tokenUsage.input + tokenUsage.output,
      cost: costUsd.toFixed(4),
    };
  };

  // Extract artifact payloads
  const getArtifactPayload = (type: 'PLAN' | 'ARCHITECTURE' | 'AWS_ARCHITECTURE') => {
    if (!projectState || !projectState.artifacts) return null;
    const artifact = projectState.artifacts.find((a: any) => a.type === type);
    return artifact ? artifact.payload : null;
  };

  if (loading && !jobState) {
    return (
      <main>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', gap: '1rem' }}>
          <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
          <p style={{ color: 'var(--text-secondary)' }}>Loading job details...</p>
        </div>
      </main>
    );
  }

  if (error && !jobState) {
    return (
      <main>
        <div className="error-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Error loading job: {error}</span>
        </div>
        <button className="submit-btn" onClick={() => router.push('/')}>Go back home</button>
      </main>
    );
  }

  const currentJobStatus = jobState?.status || 'PENDING';
  const promptText = projectState?.prompt || 'Loading prompt...';

  const plannerStatus = getAgentStatus('planner');
  const architectureStatus = getAgentStatus('architecture');
  const awsExpertStatus = getAgentStatus('aws_expert');

  const plannerMetrics = getAgentMetrics('planner');
  const architectureMetrics = getAgentMetrics('architecture');
  const awsExpertMetrics = getAgentMetrics('aws_expert');

  const planPayload = getArtifactPayload('PLAN');
  const archPayload = getArtifactPayload('ARCHITECTURE');
  const awsPayload = getArtifactPayload('AWS_ARCHITECTURE');

  return (
    <main>
      <div className="job-header">
        <div className="job-title-group">
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Pipeline Generation</h1>
          <span className="job-id-badge">Job ID: {jobId}</span>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Prompt: "{promptText}"
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className={`status-badge ${connected ? 'success' : 'warning'}`}>
            WebSocket: {connected ? 'Connected' : 'Offline'}
          </span>
          <span className={`status-badge ${
            currentJobStatus === 'COMPLETE' ? 'success' :
            currentJobStatus === 'FAILED' ? 'error' :
            currentJobStatus === 'RUNNING' ? 'running' : ''
          }`}>
            Job Status: {currentJobStatus}
          </span>
        </div>
      </div>

      {jobState?.errorMessage && (
        <div className="error-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Pipeline Error: {jobState.errorMessage}</span>
        </div>
      )}

      {/* Pipeline checklist */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Multi-Agent Execution Pipeline</h2>
      <div className="pipeline-container">
        {/* Planner Step */}
        <div className={`pipeline-card ${
          plannerStatus === 'RUNNING' ? 'running' :
          plannerStatus === 'COMPLETE' ? 'complete' :
          plannerStatus === 'FAILED' ? 'failed' : ''
        }`}>
          <div className="pipeline-step-header">
            <span className="pipeline-step-num">Wave 1 — Sequential</span>
            {plannerStatus === 'RUNNING' && <span className="spinner"></span>}
            {plannerStatus === 'COMPLETE' && (
              <span style={{ color: 'var(--success-accent)', fontWeight: 'bold' }}>✓</span>
            )}
            {plannerStatus === 'FAILED' && (
              <span style={{ color: 'var(--error-accent)', fontWeight: 'bold' }}>✗</span>
            )}
          </div>
          <h3 className="pipeline-step-title">Planner Agent</h3>
          <p className="pipeline-step-desc">Analyzes project requirements, identifies constraints, scope, and key scaling limits.</p>
          {plannerMetrics && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
              <div>Duration: {plannerMetrics.durationSec}s</div>
              <div>Tokens: {plannerMetrics.tokens}</div>
              <div>Cost: ${plannerMetrics.cost}</div>
            </div>
          )}
        </div>

        {/* Core Architecture Step */}
        <div className={`pipeline-card ${
          architectureStatus === 'RUNNING' ? 'running' :
          architectureStatus === 'COMPLETE' ? 'complete' :
          architectureStatus === 'FAILED' ? 'failed' : ''
        }`}>
          <div className="pipeline-step-header">
            <span className="pipeline-step-num">Wave 2 — Parallel</span>
            {architectureStatus === 'RUNNING' && <span className="spinner"></span>}
            {architectureStatus === 'COMPLETE' && (
              <span style={{ color: 'var(--success-accent)', fontWeight: 'bold' }}>✓</span>
            )}
            {architectureStatus === 'FAILED' && (
              <span style={{ color: 'var(--error-accent)', fontWeight: 'bold' }}>✗</span>
            )}
          </div>
          <h3 className="pipeline-step-title">Architecture Expert</h3>
          <p className="pipeline-step-desc">Designs service component architecture, determines database replica strategies and caching.</p>
          {architectureMetrics && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
              <div>Duration: {architectureMetrics.durationSec}s</div>
              <div>Tokens: {architectureMetrics.tokens}</div>
              <div>Cost: ${architectureMetrics.cost}</div>
            </div>
          )}
        </div>

        {/* AWS Expert Step */}
        <div className={`pipeline-card ${
          awsExpertStatus === 'RUNNING' ? 'running' :
          awsExpertStatus === 'COMPLETE' ? 'complete' :
          awsExpertStatus === 'FAILED' ? 'failed' : ''
        }`}>
          <div className="pipeline-step-header">
            <span className="pipeline-step-num">Wave 2 — Parallel</span>
            {awsExpertStatus === 'RUNNING' && <span className="spinner"></span>}
            {awsExpertStatus === 'COMPLETE' && (
              <span style={{ color: 'var(--success-accent)', fontWeight: 'bold' }}>✓</span>
            )}
            {awsExpertStatus === 'FAILED' && (
              <span style={{ color: 'var(--error-accent)', fontWeight: 'bold' }}>✗</span>
            )}
          </div>
          <h3 className="pipeline-step-title">AWS Expert</h3>
          <p className="pipeline-step-desc">Formulates AWS Well-Architected infrastructure deployment mapping, VPC setups, and load balancing.</p>
          {awsExpertMetrics && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
              <div>Duration: {awsExpertMetrics.durationSec}s</div>
              <div>Tokens: {awsExpertMetrics.tokens}</div>
              <div>Cost: ${awsExpertMetrics.cost}</div>
            </div>
          )}
        </div>
      </div>

      {/* Generated Artifacts tabs */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Generated Architectural Artifacts</h2>
      <div className="tabs-container">
        <div className="tabs-list">
          <button
            className={`tab-btn ${activeTab === 'PLAN' ? 'active' : ''}`}
            onClick={() => setActiveTab('PLAN')}
          >
            Project Plan
          </button>
          <button
            className={`tab-btn ${activeTab === 'ARCHITECTURE' ? 'active' : ''}`}
            onClick={() => setActiveTab('ARCHITECTURE')}
          >
            Core Architecture
          </button>
          <button
            className={`tab-btn ${activeTab === 'AWS_ARCHITECTURE' ? 'active' : ''}`}
            onClick={() => setActiveTab('AWS_ARCHITECTURE')}
          >
            AWS Infrastructure
          </button>
        </div>
        <div className="tab-content">
          {activeTab === 'PLAN' && (
            <div>
              {planPayload ? (
                <div className="code-block-wrapper">
                  <pre className="code-block">
                    {JSON.stringify(planPayload, null, 2)}
                  </pre>
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                  {plannerStatus === 'RUNNING' ? 'Generating project plan...' : 'Planner has not run yet.'}
                </p>
              )}
            </div>
          )}
          {activeTab === 'ARCHITECTURE' && (
            <div>
              {archPayload ? (
                <div className="code-block-wrapper">
                  <pre className="code-block">
                    {JSON.stringify(archPayload, null, 2)}
                  </pre>
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                  {architectureStatus === 'RUNNING' ? 'Designing core architecture...' : 'Architecture expert has not run yet.'}
                </p>
              )}
            </div>
          )}
          {activeTab === 'AWS_ARCHITECTURE' && (
            <div>
              {awsPayload ? (
                <div className="code-block-wrapper">
                  <pre className="code-block">
                    {JSON.stringify(awsPayload, null, 2)}
                  </pre>
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
                  {awsExpertStatus === 'RUNNING' ? 'Formulating AWS mapping...' : 'AWS expert has not run yet.'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div style={{ marginTop: '2.5rem', display: 'flex', gap: '1rem' }}>
        <button className="submit-btn" style={{ background: 'none', border: '1px solid var(--border-color)' }} onClick={() => router.push('/')}>
          Back to Dashboard
        </button>
      </div>
    </main>
  );
}
