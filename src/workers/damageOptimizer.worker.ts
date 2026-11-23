import { optimizeDamageSteps } from "../lib/damage/optimizer";
import { DamageDataset, OptimizerOptions } from "../lib/damage/types";

let cancelled = false;
self.onmessage = (event: MessageEvent) => {
  const message=event.data;
  if(message?.type==="cancel"){cancelled=true;return;}
  if(message?.type!=="run")return;
  cancelled=false;
  try {
    const iterator=optimizeDamageSteps(message.dataset as DamageDataset,message.options as OptimizerOptions,()=>cancelled);
    const step=()=>{
      if(cancelled){self.postMessage({type:"cancelled"});return;}
      try { const next=iterator.next(); if(next.done)self.postMessage({type:"result",result:next.value}); else {self.postMessage({type:"progress",progress:next.value});setTimeout(step,0);} }
      catch(error){self.postMessage({type:"error",error:error instanceof Error?error.message:"Hesaplama başarısız."});}
    };
    setTimeout(step,0);
  } catch(error) { self.postMessage({type:"error",error:error instanceof Error?error.message:"Hesaplama başarısız."}); }
};
