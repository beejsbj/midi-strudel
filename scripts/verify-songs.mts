/**
 * Full-song verification: converts both bundled songs in 12 configurations
 * (chained/colon x absolute/relative/3-4 at 90 BPM), plays the generated code
 * through Strudel's real evaluator, and checks every event against an
 * independent oracle built from the raw MIDI: pitch or drum sample, onset
 * (1 µs), gate (0.0005 of its slot), velocity, multiplicity, the shared loop
 * span, and phrase/loop boundaries. Takes a few minutes; not part of `test`.
 *
 *   bun run verify:songs [--song warrior-of-the-mind]
 *
 * Environment variables:
 *   VERIFY_SONGS_OUT: output directory (default: <tmp>/midi-strudel-verify-songs)
 *   VERIFY_SONGS_TIMEOUT_MS: per-run timeout in milliseconds (default: 180000)
 */
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const filename=fileURLToPath(import.meta.url);
const root=resolve(dirname(filename),'..');
const scratch=process.env.VERIFY_SONGS_OUT??join(tmpdir(),'midi-strudel-verify-songs');
mkdirSync(scratch,{recursive:true});
const require=createRequire(root+'/package.json');
const songs=['ruthlessness','warrior-of-the-mind'];
const modes=['chained','colon'];
const profiles=['absolute','relative','3-4-bpm90'];
type Event={value:string;on:number;end:number;v:number;slot?:number};
function pitch(value:unknown):number {
 if(typeof value==='number')return value;
 if(typeof value!=='string')throw new Error('No numeric or named note: '+String(value));
 if(/^[-+]?\d+(?:\.\d+)?$/.test(value))return Number(value);
 const m=/^([a-g])([#b]*)(-?\d+)$/i.exec(value);
 if(!m)throw new Error('Unrecognized note '+value);
 return ({c:0,d:2,e:4,f:5,g:7,a:9,b:11}[m[1].toLowerCase()]!)+(Number(m[3])+1)*12+[...m[2]].reduce((v,c)=>v+(c==='#'?1:-1),0);
}
let maxGateRatio=0;
function compare(observed:Event[],expected:Event[],label:string){
 if(observed.length!==expected.length)throw new Error(label+': count '+observed.length+' != '+expected.length);
 // Group by pitch/drum and exact onset; inside a group (duplicate attacks),
 // pair each observed event with the closest unused expected gate+velocity,
 // since rounded gates can reorder near-identical twins.
 const key=(e:Event)=>e.value+'@'+Math.round(e.on*1e7);
 const groups=new Map<string,Event[]>();
 for(const e of expected){const g=groups.get(key(e))??[];g.push(e);groups.set(key(e),g);}
 let maxError=0;
 for(const a of observed){
  const g=groups.get(key(a));
  if(!g||!g.length)throw new Error(label+': unexpected '+JSON.stringify(a));
  let best=0,bestScore=Infinity;
  g.forEach((b,i)=>{const score=Math.abs(a.end-b.end)/Math.max(a.slot??1,1e-12)+Math.abs(a.v-b.v);if(score<bestScore){bestScore=score;best=i;}});
  const b=g.splice(best,1)[0];
  // Contract: onsets exact (1 µs), gates within 0.0005 of their slot, velocity at three decimals.
  const onsetError=Math.abs(a.on-b.on);
  const gateError=Math.abs(a.end-b.end);
  const gateBound=a.value.startsWith('drum:')?Infinity:0.0005*(a.slot??0)+1e-6; // drums: onsets only
  maxError=Math.max(maxError,onsetError);
  if(!a.value.startsWith('drum:'))maxGateRatio=Math.max(maxGateRatio,gateError/Math.max(a.slot??1,1e-12));
  if(a.value!==b.value||Math.abs(a.v-b.v)>0.0005+1e-12||onsetError>1e-6||gateError>gateBound)throw new Error(label+': '+JSON.stringify({actual:a,expected:b,onsetError,gateError,gateBound}));
 }
 return maxError;
}
async function child(song:string,mode:string,profile:string){
 const {Midi}=require('@tonejs/midi');
 const {convertMidi}=await import(root+'/services/convertMidi.ts');
 const {evaluateGeneratedStrudelCode}=await import(root+'/services/__tests__/helpers/strudelRuntime.ts');
 const bytes=readFileSync(root+'/public/examples/'+song+'-epic-the-musical.mid');
 const source=new Midi(bytes);
 const overrides:Record<string,unknown>={controlSyntax:mode,includeVelocity:true,isTrackColoringEnabled:false};
 const {earNotes}=await import(root+'/services/__tests__/helpers/earOracle.ts');
 const {pickDrumKit,drumSample}=await import(root+'/services/drums/DrumKits.ts');
 if(profile==='relative')overrides.notationType='relative';
 if(profile==='3-4-bpm90')Object.assign(overrides,{bpm:90,timeSignature:{numerator:3,denominator:4}});
 const started=performance.now();
 const result=convertMidi(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),song+'.mid',overrides);
 if(result.config.controlSyntax!==mode)throw new Error('controlSyntax has not been integrated');
 const scale=(source.header.tempos[0]?.bpm??120)/result.config.bpm;
 const span=result.sharedSpanSeconds*scale;
 const base:Event[]=[];let dropped=0;
 let merged=0,silent=0,layers=0;
 const sourceBpm=source.header.tempos[0]?.bpm??120;
 for(const track of source.tracks){
  const drum=track.instrument.percussion||track.channel===9||/drum|perc/i.test(track.name);
  // Contract: a drum part plays on the kit with the most of its sounds (the
  // catalog is the spec), each note as its sample or nearest stand-in, as s:n.
  const kit=drum?pickDrumKit(track.notes.map((n:{midi:number})=>n.midi)):'';
  const sampleOf=(midi:number)=>{const token=drumSample(midi,kit)?.token;if(!token)return undefined;const [s,n='0']=token.split(':');return s+':'+n;};
  const seen=new Set<string>();
  const hits=new Map<string,Event>();
  // Contract: exact to the ear (see EarTiming); snapping precedes merging.
  for(const note of earNotes(track.notes,sourceBpm,source.header.ppq)){
   if(drum&&!sampleOf(note.midi)){dropped++;continue;}
   // Contract: zero-length pitched notes are silent and dropped; fully identical
   // doubles merge (drums ignore length, being one-shots).
   if(!drum&&note.duration<=0){silent++;continue;}
   const key=note.midi+':'+Math.round(note.time*1e9)+':'+(drum?'':Math.round(note.duration*1e9))+':'+note.velocity;
   if(seen.has(key)){merged++;continue;}
   seen.add(key);
   // Contract: a drum sample plays once per instant, at the loudest hit.
   if(drum){
    const hit=sampleOf(note.midi)+'@'+Math.round(note.time*1e9);
    const prior=hits.get(hit);
    if(prior){prior.v=Math.max(prior.v,note.velocity);layers++;continue;}
   }
   const event={value:drum?'drum:'+sampleOf(note.midi):'pitch:'+note.midi,on:note.time*scale,end:(note.time+note.duration)*scale,v:note.velocity};
   if(drum)hits.set(sampleOf(note.midi)+'@'+Math.round(note.time*1e9),event);
   base.push(event);
  }
 }
 const maxRelease=Math.max(0,...base.map(e=>e.end));
 const meter=source.header.timeSignatures[0]?.timeSignature??[4,4];
 const measure=60/(source.header.tempos[0]?.bpm??120)*meter[0]*4/meter[1]*scale;
 const expectedSpan=Math.max(1,Math.ceil(maxRelease/measure-1e-12))*measure;
 if(Math.abs(span-expectedSpan)>1e-7)throw new Error('Shared source-measure span mismatch '+span+' != '+expectedSpan);
 const expected=(loops:number)=>Array.from({length:loops},(_,loop)=>base.map(e=>({...e,on:e.on+loop*span,end:e.end+loop*span}))).flat();
 const runtime=await evaluateGeneratedStrudelCode(result.code,{exactBpm:result.config.bpm});
 const query=(start:number,end:number):Event[]=>runtime.querySeconds(start,end).map(e=>({value:e.value.note!==undefined?'pitch:'+pitch(e.value.note):'drum:'+e.value.s+':'+Number(e.value.n??0),on:e.onsetSeconds,end:e.gateEndSeconds,v:Number(e.value.velocity),slot:e.wholeEndSeconds-e.onsetSeconds}));
 try{
  const fullQueryStart=performance.now();
  const observedTwo=query(0,span*2);
  const fullQueryMs=Math.round(performance.now()-fullQueryStart);
  let maxError=compare(observedTwo,expected(2),'two loops');
  console.log('PROBE_CHECKPOINT '+JSON.stringify({song,mode,profile,fullQueryMs,events:observedTwo.length,sourceEventsMatch:true}));
  const expectedThree=expected(3);
  const boundaries=new Set<number>([span,span*2]);
  // Occurrence seconds are source-tempo performance time; scale to configured playback.
  const patterns=result.patterns;
  if(!patterns)throw new Error('Structured pattern metadata missing');
  const occurrences=patterns?.occurrences??[];
  const requested=new Map<number,Set<string>>();
  const select=(time:number,reason:string)=>{time=Math.round(time*1e9)/1e9;const reasons=requested.get(time)??new Set();reasons.add(reason);requested.set(time,reasons);};
  select(span,'loop-1');select(span*2,'loop-2');
  const shapePhaseKeys=new Set<string>();
  const endShapes=new Set<number>();
  for(const occurrence of occurrences){
   if(typeof occurrence.startSeconds!=='number'||typeof occurrence.endSeconds!=='number')throw new Error('Unsupported phrase occurrence metadata shape: '+JSON.stringify(occurrence));
   for(let loop=0;loop<2;loop++)for(const time of [occurrence.startSeconds,occurrence.endSeconds])boundaries.add(time*scale+loop*span);
   const duration=occurrence.endSeconds-occurrence.startSeconds;
   const restartPhase=(Math.round((((occurrence.startSeconds/duration)%1)+1)%1*1e7)%1e7)/1e7;
   const key=occurrence.definitionId+':phase:'+restartPhase;
   if(!shapePhaseKeys.has(key)){shapePhaseKeys.add(key);select(occurrence.startSeconds*scale,key);}
   if(!endShapes.has(occurrence.measureCount)){endShapes.add(occurrence.measureCount);select(occurrence.endSeconds*scale,'end-measures:'+occurrence.measureCount);}
  }
  const adjacencyKinds=new Set<string>();
  const byTrack=new Map<string,Array<{trackId:string;startSeconds:number;endSeconds:number}>>();
  for(const occurrence of occurrences){const list=byTrack.get(occurrence.trackId)??[];list.push(occurrence);byTrack.set(occurrence.trackId,list);}
  for(const trackOccurrences of byTrack.values()){
   trackOccurrences.sort((a,b)=>a.startSeconds-b.startSeconds);
   for(let i=1;i<trackOccurrences.length;i++){
    const before=trackOccurrences[i-1],after=trackOccurrences[i];
    const kind=Math.abs(before.endSeconds-after.startSeconds)<1e-9?'adjacent':'gap';
    if(!adjacencyKinds.has(kind)){adjacencyKinds.add(kind);select(before.endSeconds*scale,kind+'-before');select(after.startSeconds*scale,kind+'-after');}
   }
  }
  // Full two-loop evaluation remains authoritative for every occurrence. Filtering
  // its cached events validates all internal boundaries without reevaluating the
  // complete score hundreds of times. Fragment queries below test query semantics.
  let cachedBoundaryWindows=0;
  for(const boundary of boundaries){
   if(boundary>=span*2)continue; // separately queried against a three-loop oracle
   const from=Math.max(0,boundary-.0001),to=boundary+.0001;
   maxError=Math.max(maxError,compare(observedTwo.filter(e=>e.on>=from&&e.on<to),expectedThree.filter(e=>e.on>=from&&e.on<to),'cached boundary '+boundary));
   cachedBoundaryWindows++;
  }
  const fragmentStart=performance.now();
  const fragmentSelections=[...requested.entries()].slice(0,24);
  for(const [boundary] of fragmentSelections){
   const from=Math.max(0,boundary-.0001),to=boundary+.0001;
   maxError=Math.max(maxError,compare(query(from,to),expectedThree.filter(e=>e.on>=from&&e.on<to),'fragment boundary '+boundary));
  }
  const fragmentQueryMs=Math.round(performance.now()-fragmentStart);
  const fragmentCoverageComplete=requested.size<=24;
  if(!fragmentCoverageComplete)console.warn('FRAGMENT_COVERAGE_LIMIT '+JSON.stringify({requestedWindows:requested.size,selectedWindows:fragmentSelections.length,omittedReasons:[...requested.entries()].slice(24).flatMap(([,reasons])=>[...reasons])}));
  const row={song,mode,profile,pass:true,sourceNotes:source.tracks.reduce((n:number,t:{notes:unknown[]})=>n+t.notes.length,0),supportedNotes:base.length,dropped,merged,layers,silent,span,codeChars:result.code.length,cachedBoundaryWindows,fragmentQueryWindows:fragmentSelections.length,fragmentCoverageComplete,fragmentSelections:fragmentSelections.map(([time,reasons])=>({time,reasons:[...reasons]})),fullQueryMs,fragmentQueryMs,phraseOccurrences:occurrences.length,maxErrorSeconds:maxError,maxGateErrorPerSlot:maxGateRatio,elapsedMs:Math.round(performance.now()-started),diagnostics:result.diagnostics};
  writeFileSync(`${scratch}/bundled-${song}-${mode}-${profile}.strudel`,result.code);
  console.log('PROBE_RESULT '+JSON.stringify(row));
 }finally{runtime.stop();}
}
async function run(){
 if(process.argv[2]==='--child')return child(process.argv[3],process.argv[4],process.argv[5]);
 const rows:Record<string,unknown>[]=[];
 const chosenSong=process.argv.includes('--song')?process.argv[process.argv.indexOf('--song')+1]:undefined;
 const timeoutMs=process.env.VERIFY_SONGS_TIMEOUT_MS?Number(process.env.VERIFY_SONGS_TIMEOUT_MS):180000;
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error(`VERIFY_SONGS_TIMEOUT_MS must be a positive number (got ${process.env.VERIFY_SONGS_TIMEOUT_MS})`);
 for(const song of chosenSong?[chosenSong]:songs)for(const mode of modes)for(const profile of profiles){
  console.log(`Checking ${song} / ${mode} / ${profile}`);
  const row=await new Promise<Record<string,unknown>>((resolve,reject)=>{
   const p=spawn(root+'/node_modules/.bin/tsx',[filename,'--child',song,mode,profile],{cwd:root,detached:true,stdio:['ignore','pipe','pipe']});
   let output='';let error='';
   const timer=setTimeout(()=>{process.kill(-p.pid!, 'SIGKILL');reject(new Error(`${song}/${mode}/${profile} exceeded ${timeoutMs}ms`));},timeoutMs);
   p.stdout.on('data',chunk=>output+=chunk);p.stderr.on('data',chunk=>error+=chunk);
   p.on('error',err=>{clearTimeout(timer);reject(err);});
   p.on('exit',code=>{clearTimeout(timer);writeFileSync(`${scratch}/bundled-${song}-${mode}-${profile}.log`,output+'\n'+error);if(code!==0)return reject(new Error(output+'\n'+error));const line=output.split('\n').find(s=>s.startsWith('PROBE_RESULT '));if(!line)return reject(new Error('Missing probe result'));resolve(JSON.parse(line.slice(13)));});
  });
  rows.push(row);console.log(JSON.stringify(row));
 }
 writeFileSync(scratch+'/results.json',JSON.stringify(rows,null,2)+'\n');
 console.log(`All ${rows.length} cases passed`);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
