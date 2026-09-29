// The coach's transport for the engine's AI requests: the browser's direct
// call to the Messages API with the coach's own key (TECHNICAL §141). The
// same request BLOC sends with its user's key (index.html blocCallModel).
// The key lives on this device only, under Coach's own storage key; it's
// never sent anywhere but Anthropic, and signing out keeps it.
import type { CallModel } from '@engine';
import { KEYS } from '@/lib/storage';

export function getAiKey(): string | null {
  try { return localStorage.getItem(KEYS.aiKey) || null; } catch { return null; }
}
export function setAiKey(key: string | null): void {
  if (key) localStorage.setItem(KEYS.aiKey, key); else localStorage.removeItem(KEYS.aiKey);
}

export function coachCallModel(apiKey: string): CallModel {
  return async (request) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || `API error ${res.status}`);
    }
    const data = await res.json();
    const text = ((data.content || []) as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, stopReason: data.stop_reason };
  };
}
