// Package the original PNG as a Windows ICO with native sizes and preserved alpha.
const {app,nativeImage}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
app.whenReady().then(async()=>{
  const directory=path.resolve(__dirname,'../desktop/icons');
  const source=nativeImage.createFromPath(path.join(directory,'stm-simulator.png'));
  if(source.isEmpty()||source.getSize().width!==source.getSize().height)throw new Error('Expected a square app icon PNG');
  const sizes=[16,20,24,32,40,48,64,128,256];
  const frames=sizes.map(size=>source.resize({width:size,height:size,quality:'best'}).toPNG());
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  frames.forEach((frame,i)=>{
    const entry=6+i*16;header[entry]=header[entry+1]=sizes[i]===256?0:sizes[i];
    header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);
    header.writeUInt32LE(frame.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=frame.length;
  });
  await fs.writeFile(path.join(directory,'stm-simulator.ico'),Buffer.concat([header,...frames]));
  console.log(`Windows icon packaged: ${sizes.join(', ')} px`);app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
