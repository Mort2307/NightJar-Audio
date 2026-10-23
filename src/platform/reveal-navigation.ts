/**
 * Navigate to an intentionally revealed section, not a guessed timer delay.
 *
 * Home sections may be hidden/collapsed by the member; Workspace sections may
 * defer expensive content until opened. The destination must be visible and
 * expanded before scrolling. No global click/scroll listener, no profile or
 * account state mutation, no remote API request.
 */
type RevealTarget = 'home' | 'workspace';

function revealSection(kind:RevealTarget, sectionId:string) {
  const targetId = kind === 'home' ? 'nightjar-home-' + sectionId : 'nightjar-workspace-' + sectionId;
  const eventName = kind === 'home' ? 'nightjar:open-home-section' : 'nightjar:open-workspace-section';
  const root = document.getElementById('root') ?? document.body;
  let finished = false;
  let timeoutId:number|undefined;
  let frameId:number|undefined;
  let observer:MutationObserver|undefined;

  const cleanup=()=>{
    if(finished)return;
    finished=true;
    observer?.disconnect();
    if(timeoutId!==undefined)window.clearTimeout(timeoutId);
    if(frameId!==undefined)window.cancelAnimationFrame(frameId);
  };
  const tryScroll=()=>{
    if(finished)return;
    const target=document.getElementById(targetId);
    if(!target || target.getClientRects().length===0)return;
    const toggle=target.querySelector<HTMLButtonElement>(kind==='home'?'.nj-home-section-toggle':'.nj-workspace-fold-trigger');
    if(toggle?.getAttribute('aria-expanded')!=='true')return;
    cleanup();
    const quiet=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({behavior:quiet?'auto':'smooth',block:'start'});
  };

  window.dispatchEvent(new CustomEvent(eventName,{detail:sectionId}));
  observer=new MutationObserver(tryScroll);
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-expanded','hidden','class']});
  timeoutId=window.setTimeout(cleanup,5000); // No observer remains after a failed reveal.
  frameId=window.requestAnimationFrame(tryScroll);
}

export const revealHomeSection=(sectionId:string)=>revealSection('home',sectionId);
export const revealWorkspaceSection=(sectionId:string)=>revealSection('workspace',sectionId);
