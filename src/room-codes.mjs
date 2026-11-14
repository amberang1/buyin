// New rooms use four digits. Keep six-digit invitations working during rollout.
export function isRoomCode(value){return typeof value==='string'&&/^(?:\d{4}|\d{6})$/.test(value);}
export function createRoomCode(randomInt){return String(randomInt(0,10000)).padStart(4,'0');}
