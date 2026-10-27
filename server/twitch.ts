import WebSocket from 'ws';
import type { TwitchStatus } from '../shared/protocol.ts';

const API = 'https://api.twitch.tv/helix';
const AUTH = 'https://id.twitch.tv/oauth2';
export interface TwitchConfig { clientId: string; clientSecret: string; redirectUri: string }
export interface TwitchTokens { access_token: string; refresh_token: string; expires_in: number }
interface TwitchIdentity { userId: string; login: string }
interface TwitchHooks {
  status: (status: TwitchStatus, error?: string) => void;
  chat: (id: string, name: string, text: string) => void;
}
export async function exchangeCode(config: TwitchConfig, code: string): Promise<TwitchTokens> {
  const response = await fetch(`${AUTH}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.clientId, client_secret: config.clientSecret,
      code, grant_type: 'authorization_code', redirect_uri: config.redirectUri,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('Twitch could not complete authorization. Try connecting again.');
  return response.json() as Promise<TwitchTokens>;
}
export async function validateToken(config: TwitchConfig, accessToken: string): Promise<TwitchIdentity> {
  const response = await fetch(`${AUTH}/validate`, {
    headers: { Authorization: `OAuth ${accessToken}` }, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error('Twitch authorization expired. Connect your channel again.');
  const identity = await response.json() as { client_id: string; user_id: string; login: string; scopes: string[] };
  if (identity.client_id !== config.clientId || !identity.scopes.includes('user:read:chat') || !identity.user_id) {
    throw new Error('Twitch chat permission is missing. Connect again and approve chat access.');
  }
  return { userId: identity.user_id, login: identity.login };
}
export class TwitchConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private validationTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private attempts = 0;
  private seen = new Set<string>();
  private keepaliveSeconds = 10;
  constructor(
    private config: TwitchConfig, private tokens: TwitchTokens, private identity: TwitchIdentity, private hooks: TwitchHooks,
    private socketFactory: (url: string) => WebSocket = url => new WebSocket(url),
  ) {}
  start() {
    this.stopped = false;
    this.scheduleRefresh();
    // Twitch requires token validation at startup and hourly.
    this.validationTimer = setInterval(() => {
      void validateToken(this.config, this.tokens.access_token).catch(() => {
        this.stop(); this.hooks.status('error', 'Twitch authorization was revoked. Connect your channel again.');
      });
    }, 60 * 60_000);
    this.open();
  }
  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.watchdog) clearTimeout(this.watchdog);
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.validationTimer) clearInterval(this.validationTimer);
    this.socket?.close();
    this.socket = null;
    this.seen.clear();
    this.tokens = { access_token: '', refresh_token: '', expires_in: 0 };
  }
  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh(), Math.max(30, this.tokens.expires_in - 120) * 1000);
  }
  private async refresh() {
    try {
      const response = await fetch(`${AUTH}/token`, {
        method: 'POST',
        body: new URLSearchParams({
          client_id: this.config.clientId, client_secret: this.config.clientSecret,
          grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error('expired');
      const tokens = await response.json() as TwitchTokens;
      if (this.stopped) return;
      this.tokens = tokens;
      this.scheduleRefresh();
    } catch {
      if (this.stopped) return;
      this.stop(); this.hooks.status('error', 'Twitch authorization expired. Connect your channel again.');
    }
  }
  private armWatchdog(seconds = 10) {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.socket?.terminate(), (seconds + 5) * 1000);
  }
  private open(reconnectUrl?: string) {
    if (this.stopped) return;
    this.hooks.status(reconnectUrl || this.attempts > 0 ? 'reconnecting' : 'connecting');
    const previous = this.socket;
    const socket = this.socketFactory(reconnectUrl ?? 'wss://eventsub.wss.twitch.tv/ws');
    this.socket = socket;
    this.armWatchdog();
    socket.on('message', data => {
      if (this.stopped || socket !== this.socket) return;
      try {
        const event = JSON.parse(data.toString());
        const type = event.metadata?.message_type;
        const messageId: string | undefined = event.metadata?.message_id;
        this.keepaliveSeconds = event.payload?.session?.keepalive_timeout_seconds ?? this.keepaliveSeconds;
        this.armWatchdog(this.keepaliveSeconds);
        if (type === 'session_welcome') {
          this.attempts = 0;
          if (reconnectUrl) {
            previous?.close();
            this.hooks.status('connected');
          } else void this.subscribe(event.payload.session.id);
        } else if (type === 'session_reconnect') {
          const target = new URL(event.payload.session.reconnect_url);
          if (target.protocol !== 'wss:' || target.hostname !== 'eventsub.wss.twitch.tv') throw new Error('Invalid reconnect host');
          this.open(target.toString());
        } else if (type === 'notification' && event.payload?.subscription?.type === 'channel.chat.message') {
          if (messageId && this.seen.has(messageId)) return;
          if (messageId) { this.seen.add(messageId); if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!); }
          const chat = event.payload.event;
          if (typeof chat?.chatter_user_id === 'string' && typeof chat?.chatter_user_name === 'string' && typeof chat?.message?.text === 'string') {
            this.hooks.chat(chat.chatter_user_id, chat.chatter_user_name, chat.message.text);
          }
        } else if (type === 'revocation') {
          this.stop(); this.hooks.status('error', 'Twitch chat access was revoked. Connect your channel again.');
        }
      } catch {
        this.hooks.status('error', 'An unexpected Twitch event was received. Reconnecting.');
        socket.terminate();
      }
    });
    socket.on('error', () => { /* Close schedules recovery; never log tokens or event payloads. */ });
    socket.on('close', () => {
      if (this.stopped || socket !== this.socket) return;
      previous?.close();
      if (this.watchdog) clearTimeout(this.watchdog);
      this.hooks.status('reconnecting', 'Chat connection interrupted. Reconnecting automatically.');
      this.reconnectTimer = setTimeout(() => this.open(), Math.min(30_000, 1000 * 2 ** Math.min(this.attempts++, 5)));
    });
  }
  private async subscribe(sessionId: string) {
    try {
      const response = await fetch(`${API}/eventsub/subscriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.tokens.access_token}`,
          'Client-Id': this.config.clientId, 'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'channel.chat.message', version: '1',
          condition: { broadcaster_user_id: this.identity.userId, user_id: this.identity.userId },
          transport: { method: 'websocket', session_id: sessionId },
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (this.stopped) return;
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Twitch chat permission was denied. Reconnect your channel.' : 'Could not subscribe to Twitch chat. Try connecting again.');
      this.hooks.status('connected');
    } catch (error) {
      if (this.stopped) return;
      this.stop();
      this.hooks.status('error', error instanceof Error ? error.message : 'Twitch connection failed.');
    }
  }
}
