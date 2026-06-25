import { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface JobEvent {
  id?: string;
  jobId: string;
  agent: string | null;
  event: string;
  payload?: any;
  timestamp: string;
}

export interface JobState {
  id: string;
  projectId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  traceId: string;
}

export function useJobSocket(jobId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [jobEvents, setJobEvents] = useState<JobEvent[]>([]);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [projectState, setProjectState] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchedRef = useRef(false);

  const fetchJobData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Job State
      const jobRes = await fetch(`http://localhost:3000/api/v1/jobs/${jobId}`);
      if (!jobRes.ok) {
        throw new Error(`Failed to fetch job details: ${jobRes.statusText}`);
      }
      const jobData: JobState = await jobRes.json();
      setJobState(jobData);

      // 2. Fetch Job Events
      const eventsRes = await fetch(`http://localhost:3000/api/v1/jobs/${jobId}/events`);
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setJobEvents(eventsData);
      }

      // 3. Fetch Project State (if complete/failed/partial)
      if (['COMPLETE', 'FAILED', 'PARTIAL'].includes(jobData.status)) {
        const projectRes = await fetch(`http://localhost:3000/api/v1/projects/${jobData.projectId}`);
        if (projectRes.ok) {
          const projectData = await projectRes.json();
          setProjectState(projectData);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchJobData();
    }

    const socketUrl = 'http://localhost:3000';
    const socketClient = io(socketUrl, {
      transports: ['websocket'],
    });

    socketClient.on('connect', () => {
      setConnected(true);
      console.log('Connected to socket server');
      // Subscribe immediately
      socketClient.emit('job:subscribe', { jobId });
    });

    socketClient.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from socket server');
    });

    // Listeners for all pipeline events
    const handlePipelineEvent = (data: any) => {
      console.log('Received pipeline event:', data);
      
      setJobEvents((prev) => {
        // Prevent duplicate events
        const exists = prev.some((e) => e.event === data.event && e.agent === data.agent);
        if (exists) return prev;
        return [...prev, data];
      });

      // Update state dynamically based on event
      if (data.event === 'job:started') {
        setJobState((prev) => prev ? { ...prev, status: 'RUNNING' } : null);
      } else if (data.event === 'job:complete') {
        setJobState((prev) => prev ? { ...prev, status: 'COMPLETE' } : null);
        fetchJobData();
      } else if (data.event === 'job:failed') {
        setJobState((prev) => prev ? { ...prev, status: 'FAILED', errorMessage: data.error } : null);
        fetchJobData();
      }
    };

    socketClient.on('job:started', handlePipelineEvent);
    socketClient.on('job:complete', handlePipelineEvent);
    socketClient.on('job:failed', handlePipelineEvent);
    socketClient.on('agent:started', handlePipelineEvent);
    socketClient.on('agent:complete', handlePipelineEvent);
    socketClient.on('agent:failed', handlePipelineEvent);

    setSocket(socketClient);

    return () => {
      socketClient.emit('job:unsubscribe', { jobId });
      socketClient.disconnect();
    };
  }, [jobId, fetchJobData]);

  return {
    connected,
    jobEvents,
    jobState,
    projectState,
    loading,
    error,
    refresh: fetchJobData,
  };
}
