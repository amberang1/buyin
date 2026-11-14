// Room updates refresh data without pulling someone away from Home or Settings.
export function roomScreen(current,roomPhase,homeVisible){
  if(current==='settings')return 'settings';
  return homeVisible?'home':roomPhase;
}
