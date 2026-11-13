import {useRef} from 'react';
import {Camera,Upload} from 'lucide-react';
type Props={disabled?:boolean;onSelect:(file:File)=>void};
export default function PhotoPicker({disabled=false,onSelect}:Props){
 const camera=useRef<HTMLInputElement>(null),library=useRef<HTMLInputElement>(null);
 const change=(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];e.target.value='';if(file)onSelect(file);};
 return <div className="grid grid-cols-2 gap-2">
  <button type="button" disabled={disabled} className="club-secondary flex items-center justify-center gap-2 text-sm" onClick={()=>camera.current?.click()}><Camera size={17}/>Take photo</button>
  <button type="button" disabled={disabled} className="club-secondary flex items-center justify-center gap-2 text-sm" onClick={()=>library.current?.click()}><Upload size={17}/>Upload photo</button>
  <input ref={camera} type="file" accept="image/*" capture="environment" hidden disabled={disabled} onChange={change}/>
  <input ref={library} type="file" accept="image/*" hidden disabled={disabled} onChange={change}/>
 </div>;
}
