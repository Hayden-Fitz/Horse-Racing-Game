import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const folder=process.argv[2];
if(!folder)throw new Error('Pass the field-teaser folder and optional original logo path.');
const logo=process.argv[3];
const prefix=logo?3:0;
const ffmpeg='D:/CapCut/9.1.0.3879/ffmpeg.exe';
const args=['-y'];
const inputs=[];
function input(file,options=[]){const index=inputs.length;inputs.push(file);args.push(...options,'-i',file);return index;}
const logoIndex=logo?input(logo,['-loop','1','-t','3']):null;
const legs=input(path.join(folder,'01-field-horse-rear-hooves-4K.mov'));
const dog=input(path.join(folder,'02-field-hotdog-chase-4K.mov'));
const black=input('color=c=black:s=3840x2160:r=30:d=0.5',['-f','lavfi']);
const end=input(path.join(folder,'03-coming-soon-4K.mov'));
const gallop=input(path.resolve('assets/audio/horse-gallop-dirt.mp3'),['-stream_loop','-1']);
const filters=[];
const clips=[];
if(logo){
  filters.push(`[${logoIndex}:v]scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p,fade=t=in:st=0:d=0.75,fade=t=out:st=2.25:d=0.75[logo]`);
  clips.push('[logo]');
}
for(const [id,label] of [[legs,'legs'],[dog,'dog'],[black,'black'],[end,'end']]){
  filters.push(`[${id}:v]setsar=1,fps=30,format=yuv420p[${label}]`);clips.push(`[${label}]`);
}
filters.push(clips.join('')+`concat=n=${clips.length}:v=1:a=0[video]`);
filters.push(`[${gallop}:a]atrim=duration=4,asetpts=PTS-STARTPTS,volume=0.65,afade=t=in:d=0.25,afade=t=out:st=3.85:d=0.15,adelay=${prefix*1000}:all=1[gallop]`);
let sounds='[gallop]',count=1;
try{
  const nature=path.join(folder,'nature-birds-CC0.wav');await fs.access(nature);
  const id=input(nature,['-stream_loop','-1']);
  filters.push(`[${id}:a]atrim=duration=4,volume=0.22,afade=t=out:st=3.7:d=0.3,adelay=${prefix*1000}:all=1[nature]`);
  sounds+='[nature]';count++;
}catch{}
filters.push(sounds+`amix=inputs=${count}:normalize=0,apad[audio]`);
// H.264 MP4 is universally playable in browsers and editors.  The prior
// MPEG-4 Part 2 export was valid but some apps displayed only its audio.
args.push('-filter_complex',filters.join(';'),'-map','[video]','-map','[audio]','-t',String(prefix+7),'-c:v','h264_mf','-quality','100','-pix_fmt','nv12','-c:a','aac','-b:a','192k','-movflags','+faststart',path.join(folder,logo?'Teaser-4K.mp4':'DRAFT-field-teaser-awaiting-logo-4K.mp4'));
const child=spawn(ffmpeg,args);let log='';child.stderr.on('data',data=>log+=data);
const code=await new Promise(resolve=>child.on('close',resolve));
if(code!==0)throw new Error(log);
console.log('Assembled '+(prefix+7)+' second teaser.');
