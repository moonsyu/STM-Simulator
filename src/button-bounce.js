// Feature 23 — contact bounce of buttons. A real push button does not change cleanly: for a few milliseconds after it is
// pressed or let go the contact opens and closes again. A program that toggles an LED on every "press" without waiting
// then toggles it several times; the course fixes that with a 20–100 ms debounce. With `simulation.bounceMs` set, a
// press or release is followed by the contact flipping once a millisecond for that long, ending in the new state.
// Both engines stop at those times and take the input over, so polling code and edge interrupts see every flip.

/** The bounce times a project may have (ms); 0 is off. */
export const BOUNCE_MS=Object.freeze([0,2,5,10,20]);

export class ButtonBounce{
  constructor(ms=0){this.ms=BOUNCE_MS.includes(ms)?ms:0;this.queue=[];this.target={};}
  /**
   * The pressed map to use at `nowMs` when the user's buttons change from `current` to `target`. With bounce on, each
   * button that changed gets its flips queued: the opposite state at +1 ms, the new one at +2 ms, … up to bounceMs,
   * always ending in the new state.
   */
  press(current,target,nowMs){
    if(!this.ms)return target;
    // Compared with what the user's buttons were (this.target), not with `current`, which may be in the middle of a bounce.
    const before=this.target;this.target={...target};
    for(const key of new Set([...Object.keys(before),...Object.keys(target||{})])){
      const goal=!!target?.[key];if(goal===!!before[key])continue;
      // A change in the middle of an earlier bounce starts over from the new state.
      this.queue=this.queue.filter(f=>f.key!==key);
      // An even number of flips, the last one (back to the new state) no later than bounceMs: 2 ms → 2, 5 → 4, 10 → 10.
      const flips=Math.floor(this.ms/2)*2;
      for(let k=1;k<=flips;k++)this.queue.push({at:nowMs+k,key,on:k%2?!goal:goal});
    }
    this.queue.sort((a,b)=>a.at-b.at);
    return target;
  }
  /** When the next queued flip is due (ms), or Infinity. */
  nextAt(){return this.queue.length?this.queue[0].at:Infinity;}
  /** Applies the flips due at `nowMs` to `pressed`; returns the new map, or null when nothing was due. */
  apply(pressed,nowMs){
    if(!this.queue.length||this.queue[0].at>nowMs+1e-9)return null;
    const next={...pressed};
    while(this.queue.length&&this.queue[0].at<=nowMs+1e-9){const f=this.queue.shift();if(f.on)next[f.key]=true;else delete next[f.key];}
    return next;
  }
  clear(){this.queue=[];this.target={};}
}
