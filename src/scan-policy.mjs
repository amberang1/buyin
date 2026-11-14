// Call only after verifying the caller can read this room through Firestore rules.
export function canScanRoom(mode,phase,isHost,hasRoomAccess){
 if(!hasRoomAccess)return false;
 if(mode==='check')return ['setup','active','settlement','results'].includes(phase);
 return isHost&&(mode==='colors'?phase==='setup':mode==='stack'&&phase==='settlement');
}
