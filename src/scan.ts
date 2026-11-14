import { auth } from './firebase';

export async function scanChips(gameId: string, mode: 'colors' | 'stack' | 'check', photo: string): Promise<string> {
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

/** Resize large phone photos before upload; preserve chip edges and orientation. */
export async function prepareChipPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 25_000_000) throw new Error('Choose an image under 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve,reject)=>{
      const el = new Image(); el.onload=()=>resolve(el); el.onerror=()=>reject(new Error('Image could not be opened. Try JPEG or PNG.')); el.src=url;
    });
    const canvas=document.createElement('canvas');
    let scale=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
    for(let attempt=0;attempt<12;attempt++){
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image processing unavailable.');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',Math.max(.60,.90-attempt*.06));
      if(data.length<180000)return data;
      scale*=.82;
    }
    throw new Error('Photo is too detailed to compress. Try a closer crop.');
  } finally { URL.revokeObjectURL(url); }
}
