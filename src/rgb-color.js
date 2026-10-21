// Colours of RGB parts: WS2812 bytes received on DIN (G→R→B on the wire) and analog channel currents.

/** Stores one received 24-bit GRB word on a device state: `grb` keeps wire order, `color` is [R,G,B]. */
export function receiveWs2812(s,grb){
 s.grb=[grb>>16&255,grb>>8&255,grb&255];s.color=[s.grb[1],s.grb[0],s.grb[2]];s.display=s.color.some(Boolean);s.frames=(s.frames||0)+1;
}
/** Approximate 0–255 brightness of each analog RGB channel from its current (6 mA ≈ full). */
export const channelLevels=channels=>['r','g','b'].map(k=>channels?.[k]?.on?Math.round(255*Math.min(1,Math.sqrt(Math.max(0,channels[k].current)/.006))):0);
/** Lens colour for a received [R,G,B]: the same hue, kept bright enough to see for small WS2812 values. Null when black. */
export function lensColor(color){
 const max=Math.max(...color);if(!(max>0))return null;
 const k=(.55+.45*Math.sqrt(max/255))*255/max;return color.map(v=>Math.round(v*k));
}
export const glowOpacity=color=>{const max=Math.max(0,...(color||[]));return max?.2+.35*Math.sqrt(max/255):0;};
export const hexColor=color=>'#'+color.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
