import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostAction, Role, RoomState, ServerMessage } from '../shared/protocol';

export function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  return path;
}
export async function api<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Mission control could not complete the request.');
  return data as T;
}
export function saveToken(roomId: string, token: string) {
  localStorage.setItem(`signallost:pilot:${roomId}`, token);
  localStorage.setItem('signallost:last-room', roomId);
}
export function getToken(roomId: string) {
  return localStorage.getItem(`signallost:pilot:${roomId}`) || '';
}
export function useRoom(roomId: string, role: Role) {
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const receivedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let fatal = false;
    const open = () => {
      if (stopped) return;
      setConnection(attempts ? 'reconnecting' : 'connecting');
      const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
      socketRef.current = socket;
      socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', roomId, role, ...(role === 'host' ? { token: getToken(roomId) } : {}) }));
      socket.onmessage = event => {
        if (stopped) return;
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === 'state') {
          receivedAt.current = Date.now(); setState(message.state);
          setNow(Date.now()); setConnection('connected'); setError(null); attempts = 0;
        } else { setError(message.message); fatal = true; setConnection('error'); }
      };
      socket.onclose = event => {
        if (stopped) return;
        if (fatal || event.code === 1008) { setConnection('error'); return; }
        setConnection('reconnecting');
        retry = setTimeout(open, Math.min(10_000, 1000 * 2 ** Math.min(attempts++, 4)));
      };
      socket.onerror = () => { /* onclose drives reconnection */ };
    };
    open();
    return () => { stopped = true; clearTimeout(retry); socketRef.current?.close(); };
  }, [roomId, role]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const action = useCallback((message: HostAction) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(message)); return true;
  }, []);
  const remaining = state ? Math.max(0, state.remainingMs - (state.phase === 'active' && !state.paused && connection === 'connected' ? Math.max(0, now - receivedAt.current) : 0)) : 0;
  return { state, connection, error, action, remaining };
}
export function formatTime(ms: number) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
export async function copy(text: string) {
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return; }
  const input = document.createElement('textarea');
  input.value = text; input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.appendChild(input); input.select();
  const success = document.execCommand('copy'); input.remove();
  if (!success) throw new Error('Copy unavailable. Select and copy the link manually.');
}
let audio: AudioContext | null = null;
export function enableAudio() {
  audio ??= new AudioContext();
  void audio.resume();
}
export function tone(kind: 'success' | 'error' | 'info') {
  if (!audio || audio.state !== 'running') return;
  const frequencies = kind === 'success' ? [523, 659, 784] : kind === 'error' ? [196, 146] : [440, 523];
  frequencies.forEach((frequency, i) => {
    const oscillator = audio!.createOscillator(); const gain = audio!.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, audio!.currentTime + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.055, audio!.currentTime + i * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio!.currentTime + i * 0.1 + 0.2);
    oscillator.connect(gain); gain.connect(audio!.destination);
    oscillator.start(audio!.currentTime + i * 0.1); oscillator.stop(audio!.currentTime + i * 0.1 + 0.22);
  });
}
