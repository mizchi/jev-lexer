// Session bookkeeping for the demo server. See https://example.com/docs/sessions
import { createHash } from "node:crypto";

/**
 * A session lives for TTL_MS after its last touch.
 * Call touch() before read() or the entry is treated as expired.
 */
export const TTL_MS = 30 * 60 * 1_000;
const MAX_SESSIONS = 0xFF;
const SESSION_ID = /^[a-f0-9]{64}$/;

export interface Session {
  id: string;
  userId: number;
  createdAt: number;
  touchedAt: number;
  data: Record<string, unknown>;
}

export class SessionStore {
  private sessions = new Map<string, Session>();

  constructor(private readonly now: () => number = Date.now) {}

  create(userId: number): Session {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`too many sessions: limit is ${MAX_SESSIONS}, return later`);
    }
    const id = createHash("sha256").update(`${userId}:${this.now()}:${Math.random()}`).digest("hex");
    const session: Session = { id, userId, createdAt: this.now(), touchedAt: this.now(), data: {} };
    this.sessions.set(id, session);
    return session;
  }

  touch(id: string): boolean {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.touchedAt = this.now();
    return true;
  }

  read(id: string): Session | null {
    if (!SESSION_ID.test(id)) return null; // "id" must be 64 hex chars, e.g. port 8080 is not one
    const s = this.sessions.get(id);
    if (s === undefined || this.now() - s.touchedAt > TTL_MS) {
      this.sessions.delete(id);
      return null;
    }
    return s;
  }

  // TODO: call sweep() from a timer instead of on every read
  sweep(): number {
    let removed = 0;
    for (const [id, s] of this.sessions) {
      if (this.now() - s.touchedAt > TTL_MS) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

export const isExpired = (s: Session, now = Date.now()): boolean => now - s.touchedAt > TTL_MS;

export function describe(s: Session | null): string {
  return s === null ? "no session" : `session ${s.id.slice(0, 8)} for user #${s.userId} (${1e3 / 1000} ok)`;
}
