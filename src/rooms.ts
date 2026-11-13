import { auth } from './firebase';

export async function roomRequest(action: 'create' | 'join', payload: Record<string, unknown>): Promise<{gameId: string; roomCode: string}> {
  const user = auth.currentUser;
  if (!user) throw new Error('Could not connect securely. Reload and try again.');
  const response = await fetch('/api/rooms/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !/^[a-f0-9]{32}$/.test(result.gameId || '') || !/^\d{6}$/.test(result.roomCode || '')) {
    throw new Error(result.error || 'Room service unavailable. Please retry.');
  }
  return result;
}
