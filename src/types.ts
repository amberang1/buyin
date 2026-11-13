export type Phase = 'home' | 'setup' | 'active' | 'settlement' | 'results' | 'settings';

export type Player = {
  id: string;
  name: string;
  ownerUid?: string;
  buyIns: number[];
  cashOuts: number[];
  cashOutChipUnits?: number[];
  finalStackValue: number;
  photoUrl?: string;
};

export type ExchangeRate = {
  baseCurrency: number;
  chips: number;
  chipValues: Record<string, number>;
};



export type PlayerRequest = {
 id:string;uid:string;playerId:string;playerName:string;kind:'claim'|'buyIn'|'cashOut';amount:number;
 status:'requested'|'confirmed'|'rejected'|'reversed';createdAt:string;resolvedAt?:string;reason?:string;confirmedAmount?:number;entryIndex?:number;
};
export type Payment = {playerId:string;paidCents:number;updatedAt:string};
