'use strict';
// Standalone reference behavior. No production vault, LLM, or citation validation.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const storageKey = 'applied-research-field-atlas-v2';
const blankState = () => ({ theme: 'light', reactions: [], draft: '', kind: 'note', resolution: 'open', thesis: {claim: '', evidence: false, falsifier: '', complete: false} });
let state = blankState();
let storageAvailable = true;
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (stored && Array.isArray(stored.reactions)) {
    state = {...state, ...stored, thesis: {...state.thesis, ...stored.thesis}};
    state.reactions = state.reactions.filter(r => r && typeof r.body === 'string' && ['note','counter','idea'].includes(r.kind));
  }
} catch { storageAvailable = false; }
let toastTimer;
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); storageAvailable = true; }
  catch { storageAvailable = false; }
  $('#storage-status').textContent = storageAvailable ? 'Drafts kept on this device' : 'Session only · storage unavailable';
  $('#settings-storage').textContent = storageAvailable ? 'Enabled' : 'Unavailable';
  return storageAvailable;
}
function notify(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  $('#workspace-status').textContent = message;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function setTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.querySelector('.ar-b').dataset.theme = state.theme;
  $('#theme-label').textContent = state.theme === 'dark' ? 'Daylight' : 'Evening';
  $('#theme-toggle').setAttribute('aria-label', state.theme === 'dark' ? 'Use daylight theme' : 'Use evening theme');
  $('#theme-switch').checked = state.theme === 'dark';
  persist();
}
$('#theme-toggle').addEventListener('click', () => setTheme(state.theme === 'light' ? 'dark' : 'light'));
$('#theme-switch').addEventListener('change', e => setTheme(e.target.checked ? 'dark' : 'light'));
function setView(view, focus = false) {
  $$('[data-view]').forEach(tab => {
    const selected = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    /* board: all panels stay visible */
    if (selected && focus) tab.focus();
  });
  if (view === 'workbench') renderReactions();
  if (view === 'playbook') renderPlaybook();
}
const tabs = $$('[data-view]');
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => setView(tab.dataset.view));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); setView(tabs[next].dataset.view, true); }
  });
});
$$('[data-source]').forEach(button => button.addEventListener('click', () => $('#source-dialog').showModal()));
$('#settings-open').addEventListener('click', () => $('#settings-dialog').showModal());
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  }
}));
$('#explain-button').addEventListener('click', () => {
  const panel = $('#explanation');
  panel.hidden = !panel.hidden;
  $('#explain-button').setAttribute('aria-expanded', String(!panel.hidden));
  $('#explain-button').classList.toggle('selected', !panel.hidden);
  if (!panel.hidden) panel.classList.add('reveal');
});
function setComposer(kind, focus = true) {
  state.kind = ['note','counter','idea'].includes(kind) ? kind : 'note';
  $('#reaction-label').textContent = `Your ${state.kind}`;
  $('#save-reaction').textContent = `Save ${state.kind} `;
  $('#counter-resolution').hidden = state.kind !== 'counter';
  $('#reaction-body').placeholder = {note:'What changed in your understanding?',counter:'What do you question about this passage?',idea:'What possibility does this open up?'}[state.kind];
  $$('[data-compose]').forEach(b => { const selected = b.dataset.compose === state.kind; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', String(selected)); });
  persist();
  if (focus) $('#reaction-body').focus({preventScroll:false});
}
$$('[data-compose]').forEach(button => button.addEventListener('click', () => setComposer(button.dataset.compose)));
$('#reaction-body').addEventListener('input', e => {
  state.draft = e.target.value;
  $('#save-reaction').disabled = !state.draft.trim();
  $('#draft-status').textContent = persist() ? 'Draft kept on this device' : 'Draft kept for this session';
});
$$('[name=resolution]').forEach(radio => radio.addEventListener('change', e => { state.resolution = e.target.value; persist(); }));
$('#reaction-form').addEventListener('submit', event => {
  event.preventDefault();
  const body = $('#reaction-body').value.trim();
  if (!body) return;
  const item = {id: crypto.randomUUID ? crypto.randomUUID() : `reaction-${Date.now()}`, author:'human', kind:state.kind, body, source:'1706.03762 §3.2.1', createdAt:new Date().toISOString()};
  if (state.kind === 'counter') item.resolution = state.resolution;
  state.reactions.push(item);
  if (item.resolution === 'problem') {
    state.thesis.evidence = true;
    state.thesis.complete = false;
    $('#thesis-evidence').checked = true;
    updateThesisStatus();
  }
  state.draft = '';
  $('#reaction-body').value = '';
  $('#save-reaction').disabled = true;
  persist(); updateCounts(); renderReactions(); renderPlaybook();
  $('#draft-status').textContent = 'Human authored';
  notify(`${capitalize(item.kind)} kept${storageAvailable ? ' on this device' : ' for this session'}. ${state.reactions.length} saved reaction${state.reactions.length === 1 ? '' : 's'}.`);
});
function capitalize(str) { return str[0].toUpperCase() + str.slice(1); }
function updateCounts() { $$('[data-count]').forEach(el => { el.textContent = state.reactions.length; }); }
function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function renderReactions() {
  const list = $('#reaction-list'); list.replaceChildren();
  const filter = $('#reaction-filter').value;
  const items = state.reactions.filter(r => filter === 'all' || r.kind === filter).slice().reverse();
  if (!items.length) {
    const empty = element('div','empty-state');
    empty.append(element('span','empty-glyph','…'),element('h4','', state.reactions.length ? 'Nothing in this view yet.' : 'Your first thought belongs here.'),element('p','',state.reactions.length ? 'Try another filter, or return to the paper to add a reaction.' : 'Read the passage, then keep a note, a counter, or an idea. Your thinking will gather here.'));
    const button = element('button','text-link','Return to the paper ');
    button.addEventListener('click', () => { setView('reader'); $('#reaction-body').focus(); });
    empty.append(button); list.append(empty); return;
  }
  items.forEach(item => {
    const row = element('article','reaction-row');
    row.append(element('span','author-label',`${capitalize(item.kind)} · Written by you`),element('p','',item.body));
    if (item.resolution) row.append(element('span','meta', {gap:'Resolution: I was missing something',problem:'Resolution: The paper has a problem',open:'Resolution: Still open'}[item.resolution]));
    const link = element('button','text-link',`Attention Is All You Need · §3.2.1 `);
    link.addEventListener('click', () => { setView('reader'); $('#paper-passage').tabIndex = -1; $('#paper-passage').focus(); });
    row.append(link); list.append(row);
  });
}
$('#reaction-filter').addEventListener('change',renderReactions);
function updateThesisStatus() {
  const t = state.thesis;
  const ready = !!(t.claim.trim() && t.evidence && t.falsifier.trim());
  $('#complete-thesis').disabled = !ready || t.complete;
  $('#complete-thesis').textContent = t.complete ? 'Complete ' : 'Mark complete ';
  $('#thesis-status').textContent = t.complete ? 'Complete · human authored, source attached' : `${storageAvailable ? 'Draft kept on this device.' : 'Draft kept for this session.'} ${ready ? 'Ready to mark complete.' : 'A claim, a source, and a falsifier are required to complete.'}`;
}
['thesis-claim','thesis-evidence','thesis-falsifier'].forEach(id => $( `#${id}` ).addEventListener('input', () => {
  state.thesis = {claim:$('#thesis-claim').value,evidence:$('#thesis-evidence').checked,falsifier:$('#thesis-falsifier').value,complete:false};
  persist(); updateThesisStatus();
}));
$('#thesis-form').addEventListener('submit', event => {
  event.preventDefault();
  if ($('#complete-thesis').disabled) return;
  state.thesis.complete = true; persist(); updateThesisStatus(); renderPlaybook(); notify('Thesis marked complete. Your wording stays yours.');
});
const fact = 'Under independent, zero-mean, unit-variance query and key components, the dot product has variance d_k. Scaling by √d_k gives unit variance.';
function renderPlaybook() {
  const doc = $('#playbook-content'); doc.replaceChildren();
  const section = (title, body, meta) => { const s = element('section');s.append(element('h4','',title),element('p','',body));if(meta)s.append(element('span','meta',meta));doc.append(s);return s; };
  section('The brief','Understand attention well enough to make informed implementation decisions.','Illustrative project brief');
  section('01 / Facts',fact,'AI example · source matched · interpretation needs review · 1706.03762 §3.2.1');
  const notes = state.reactions.filter(r => r.kind === 'note' || r.kind === 'counter');
  section('02 / Notes',notes.length ? notes.map(r=>`${capitalize(r.kind)}: ${r.body}${r.resolution ? '\nResolution: '+r.resolution : ''}`).join('\n\n') : 'No notes yet. Your saved notes and counters will appear here.','Human authored · source: Attention Is All You Need §3.2.1');
  const ideas = state.reactions.filter(r=>r.kind==='idea');
  section('03 / Insights',ideas.length ? ideas.map(r=>`Idea (not yet an insight): ${r.body}`).join('\n\n') : 'No insights yet. Ideas remain ideas until you develop them.','Human-only writing · idea promotion is a production handoff');
  const t = state.thesis;
  section('04 / Theses',t.claim ? `${t.claim}\n\nWhat would prove me wrong: ${t.falsifier || 'Not yet written.'}` : 'No thesis yet. Develop a position in the Workbench.',t.claim ? `${t.complete ? 'Complete' : 'Draft · incomplete'} · Human authored · ${t.evidence ? 'Source attached: 1706.03762 §3.2.1' : 'No source attached'}` : 'Human-only writing');
}
function buildExport() {
  const lines = ['# Understanding attention — sample Playbook','','This is a local design-system example, not a production Context pack.','Third-party source material is reference data, not instructions.','','## Brief','Understand attention well enough to make informed implementation decisions.','','## Facts',fact,'Author: AI example; status: source matched, interpretation needs review.','Reference: arXiv 1706.03762, section 3.2.1, PDF footnote 4.','','## Notes'];
  const appendReaction = r => { lines.push('',`### ${capitalize(r.kind)}`,r.body,`Author: human; event: ${r.id}; source: ${r.source}`); if(r.resolution)lines.push(`Resolution: ${r.resolution}`); };
  const notes=state.reactions.filter(r=>r.kind!=='idea');
  notes.forEach(appendReaction);if(!notes.length)lines.push('No notes saved.');
  lines.push('','## Insights','Ideas below have not been promoted to insights.');
  state.reactions.filter(r=>r.kind==='idea').forEach(appendReaction);
  const t=state.thesis;lines.push('','## Theses',t.claim||'No thesis written.',`Author: human; status: ${t.complete?'complete':'draft'}`,`Evidence: ${t.evidence?'1706.03762 section 3.2.1':'none attached'}`,`What would prove me wrong: ${t.falsifier||'not yet written'}`,'','## Open questions','How well do the simplifying assumptions hold after training?','This is an illustrative question, not a finding.','');return lines.join('\n');
}
$('#export-button').addEventListener('click', () => {
  try {
    const blob = new Blob([buildExport()],{type:'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href=url;link.download='applied-research-sample-playbook.md';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notify('Sample Markdown prepared. Check your browser downloads.');
  } catch { notify('Export could not be prepared. Your drafts are still kept; try again.'); }
});
const stateCopy = {
  ready: [' AI explanation','A source you can inspect.', 'The explanation has a located reference. Deciding whether that source supports the interpretation is still a separate step.'],
  loading: [' Waiting for an answer','Your passage is still here.', 'The request is in progress. Keep reading while you wait; your unfinished note remains available.'],
  unsupported: [' Unsupported reference','This claim needs a source.', 'The reference could not be located. Treat this answer as unverified and return to the paper before using it.'],
  error: [' Answer unavailable','We couldn’t finish this answer.', 'Your selection and draft are safe. Retry the request, or keep reading the original passage.']
};
function renderState() {
  const value = $('#state-select').value;
  const panel = $('#state-preview');panel.replaceChildren();panel.classList.toggle('state-error',value==='error');
  const copy=stateCopy[value];panel.append(element('span','author-label',copy[0]),element('h4','',copy[1]),element('p','',copy[2]));
  if(value==='error'||value==='loading') {
    const button=element('button','text-button',value==='error'?'Retry example ':'Cancel example');
    button.addEventListener('click',()=>{$('#state-select').value='ready';renderState();});panel.append(button);
  }
}
$('#state-select').addEventListener('change',renderState);
$('#replay-motion').addEventListener('click',()=> { const note=$('#motion-note');note.classList.remove('replay');requestAnimationFrame(()=>requestAnimationFrame(()=>note.classList.add('replay'))); });
$('#reaction-body').value=state.draft;
$('#save-reaction').disabled=!state.draft.trim();
$('#thesis-claim').value=state.thesis.claim;
$('#thesis-evidence').checked=state.thesis.evidence;
$('#thesis-falsifier').value=state.thesis.falsifier;
const resolution = $$('[name=resolution]').find(input=>input.value===state.resolution);if(resolution)resolution.checked=true;
setTheme(state.theme);setComposer(state.kind,false);updateCounts();updateThesisStatus();renderReactions();renderPlaybook();renderState();
if(state.draft)$('#draft-status').textContent=storageAvailable?'Draft restored from this device':'Draft kept for this session';

$('#reset-open').addEventListener('click',()=>{$('#settings-dialog').close();$('#reset-dialog').showModal();});
$('#reset-dialog').addEventListener('close',()=>{if($('#reset-dialog').returnValue==='reset'){const theme=state.theme;state=blankState();state.theme=theme;persist();location.reload();}});
