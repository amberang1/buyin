export type Phase = 'home' | 'setup' | 'active' | 'settlement' | 'results' | 'settings';

export type Player = {
  id: string;
  name: string;
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

