import {stackTotal,chipsToCents} from './ledger.mjs';
export function chipCheckSummary(counts,rate){
 const units=stackTotal(counts,rate.chipValues);
 return {units,cents:chipsToCents(units,rate)};
}
export function readChipCheck(raw,rate){
 const value=JSON.parse(raw);
 if(!value||!Array.isArray(value.warnings)||value.warnings.length>10||value.warnings.some(w=>typeof w!=='string'||w.length>240))throw new Error('Invalid chip scan. Please retry.');
 const context=value.context;
 const values=v=>JSON.stringify(Object.entries(v||{}).filter(([,n])=>n>0).sort(([a],[b])=>a.localeCompare(b)));
 if(!context||context.baseCurrency!==rate.baseCurrency||context.chips!==rate.chips||values(context.chipValues)!==values(rate.chipValues))throw new Error('Table chip values changed. Review the settings and scan again.');
 chipCheckSummary(value.counts,rate);
 return {counts:value.counts,warnings:value.warnings};
}
