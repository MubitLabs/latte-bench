import {GRID_SIZE} from './grid.js';
// All shapes use the same 4-connected outline and Euclidean 1-cell tolerance.
// No shape IDs, primitive types, preferred locations, or learned weights.
export const CONTOUR_TOLERANCE_CELLS=1;
export function outline(mask,size=GRID_SIZE){
  const points=[];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x;
    if(mask[i]&&(x===0||x===size-1||y===0||y===size-1||!mask[i-1]||!mask[i+1]||!mask[i-size]||!mask[i+size]))points.push([x,y]);
  }
  return points;
}
function directedDistances(a,b){
  return a.map(([x,y])=>{let best=Infinity;for(const [u,v] of b)best=Math.min(best,(x-u)**2+(y-v)**2);return Math.sqrt(best);});
}
export function contourMetrics(actual,target,size=GRID_SIZE){
  const a=outline(actual,size),b=outline(target,size);
  if(!a.length||!b.length)return {boundaryF1:0,boundaryPrecision:0,boundaryRecall:0,chamferCells:null,hausdorffCells:null,toleranceCells:CONTOUR_TOLERANCE_CELLS,predictedBoundaryCells:a.length,targetBoundaryCells:b.length};
  const ab=directedDistances(a,b),ba=directedDistances(b,a);
  const precision=ab.filter(x=>x<=CONTOUR_TOLERANCE_CELLS).length/ab.length,recall=ba.filter(x=>x<=CONTOUR_TOLERANCE_CELLS).length/ba.length;
  return {boundaryF1:precision+recall?2*precision*recall/(precision+recall):0,boundaryPrecision:precision,boundaryRecall:recall,
    chamferCells:(ab.reduce((s,x)=>s+x,0)/ab.length+ba.reduce((s,x)=>s+x,0)/ba.length)/2,
    hausdorffCells:Math.max(...ab,...ba),toleranceCells:CONTOUR_TOLERANCE_CELLS,predictedBoundaryCells:a.length,targetBoundaryCells:b.length};
}
// Declared before evaluating random/naive controls. A bad reference must not
// lower these floors. Calibration tightens each requirement to 90% of its witness.
export const CONCAVITY_PENALTY_WEIGHT=.25;
export const SHAPE_FLOORS=Object.freeze({minShapeIoU:.5,minShapePrecision:.8,minBoundaryF1:.8,minShapeQuality:.5});

// Convex hull of occupied cell centres, rasterized on the same grid. The
// target's negative space is hull(target) minus target, including all concavities.
export function concavityMask(target,size=GRID_SIZE){
 const points=[];for(let i=0;i<target.length;i++)if(target[i])points.push([i%size,Math.floor(i/size)]);
 const out=new Uint8Array(size*size);if(points.length<3)return out;
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const half=list=>{const h=[];for(const p of list){while(h.length>=2&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}return h;};
 const lo=half(points),hi=half([...points].reverse());const hull=[...lo.slice(0,-1),...hi.slice(0,-1)];
 if(hull.length<3)return out;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*size+x;if(target[i])continue;
  if(hull.every((p,j)=>cross(p,hull[(j+1)%hull.length],[x,y])>=0))out[i]=1;
 }
 return out;
}
export function concavityMetrics(actual,target,size=GRID_SIZE){
 const region=concavityMask(target,size);let cells=0,filled=0,density=0;
 for(let i=0;i<region.length;i++)if(region[i]){cells++;density+=actual[i];if(actual[i]>=.25)filled++;}
 const mean=cells?density/cells:0;
 // Empty fraction remains diagnostic only. Raw density supplies the continuous
 // penalty, so crossing 0.25 no longer zeroes the score or triggers a veto.
 return {concavityCells:cells,concavityFilledCells:filled,concavityEmptyFraction:cells?1-filled/cells:1,
   concavityMeanDensity:mean,concavityPenalty:CONCAVITY_PENALTY_WEIGHT*mean};
}
