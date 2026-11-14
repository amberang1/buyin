function openDrafts():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('buyin-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function draftOperation(key:string,mode:'read'|'write'|'delete',value?:unknown):Promise<any>{
  const db=await openDrafts();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode==='read'?'readonly':'readwrite');const store=tx.objectStore('drafts');const request=mode==='read'?store.get(key):mode==='write'?store.put(value,key):store.delete(key);tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
