import {validateSettings} from './ledger.mjs';
export function roomRateForHost(savedRate, fallback){
  let selected=fallback;
  try{validateSettings(savedRate);selected=savedRate;}catch{}
  validateSettings(selected);
  return structuredClone(selected);
}
export function hostRateToRemember(game,uid,action,nextGame){
  if(action!=='settings'||game.hostId!==uid)return null;
  validateSettings(nextGame.exchangeRate);
  return structuredClone(nextGame.exchangeRate);
}
