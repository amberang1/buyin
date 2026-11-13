import { auth } from './firebase';

export async function scanChips(gameId: string, mode: 'colors' | 'stack', photo: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in before scanning.');
  const match = photo.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[2].length > 4_000_000) throw new Error('Use a JPEG, PNG or WebP under 3 MB.');
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await user.getIdToken() },
    body: JSON.stringify({ gameId, mode, mimeType: match[1], image: match[2] })
  });
  const data = await response.json();
  if (!response.ok || typeof data.result !== 'string') throw new Error(data.error || 'Scan failed.');
  return data.result;
}
