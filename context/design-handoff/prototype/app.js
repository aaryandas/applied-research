// Portable design specimen: review integration removed; no real user work included.
const $ = (selector) => document.querySelector(selector);
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const screens = [
 {id:'opening',title:'Opening',question:'Does the actual input, animated placeholder and the options below it feel right?',priority:'MVP proposal: topic entry and returning projects.'},
 {id:'reader',title:'Reader + learning path',question:'Does the topic outline help you move between reading and practical work? Try an explanation and save an insight in context.',priority:'MVP proposal: topic navigation, reading, explanations and attributed notes. Durable path generation is not implemented.'},
 {id:'canvas',title:'Canvas',question:'Does the left-to-right progression make the relationship between concepts, practical work, insights and theses easier to follow?',priority:'MVP proposal: movable cards, connections, saved notes and results.'},
 {id:'practical',title:'Practical work',question:'Try the wheel controls, capture a result, and start/stop guidance. Does the handoff fit the learning flow?',priority:'MVP proposal: compatible embedded tools, external fallback, explicit guidance, returned results.'},
 {id:'playbook',title:'Playbook',question:'Does this feel like a useful record for a builder? Inspect the link from evidence to conclusions and next steps.',priority:'MVP proposal: lightweight evidence and next steps. Rich compilation and export can follow.'},
 {id:'settings',title:'Settings',question:'Are the controls and the separation of appearance, AI and saved work clear?',priority:'MVP proposal: provider connection, appearance and local work. Sync is undecided.'},
 {id:'components',title:'Reusable components',question:'Review the shared type, palette, controls, source preview and explanation states in both themes.',priority:'MVP proposal: shared foundations and required states across the shipped screens.'},
 {id:'coverage',title:'Screen coverage',question:'Review the proposed MVP priorities and the remaining states before we call the full desktop design final.',priority:'All priorities here are proposals. Your choices override them.'},
];
const workspaceViews = [['canvas','canvas','Canvas'],['practical','tool','Practical'],['playbook','note','Playbook']];
const learningTopics = [
 {id:'motion',title:'Wheel motion',items:[
  {id:'wheel-speeds',title:'Wheel speeds and turning',glyph:'book',layer:'base'},
  {id:'turning-radius',title:'Turning radius',glyph:'book',layer:'deeper'},
  {id:'try-wheels',title:'Try wheel speeds',glyph:'tool',tool:'embedded'},
 ]},
 {id:'feedback',title:'Feedback / control',items:[
  {id:'drifting-path',title:'Correct a drifting path',glyph:'book',layer:'feedback-preview',preview:'Compare a simple feedback controller with an open-loop command. Use the error you observe to choose the next change.'},
 ]},
 {id:'floor',title:'Testing on a real floor',items:[
  {id:'real-floor',title:'What changes on a real floor?',glyph:'question',layer:'floor-preview',preview:'Bring back a short run from your own tool or robot. Compare it with your model and keep the evidence.'},
  {id:'return-result',title:'Bring back a result',glyph:'link',tool:'external'},
 ]},
];
const learningItems = learningTopics.flatMap(topic=>topic.items);
let view = 'opening';
let theme = 'dark';
let explanationState = 'playing';
let explanationVisible = true;
let noteComposerOpen = false;
let insightComposerOpen = false;
let insightDraft = '';
let draftSupportIds = [];
let draftNoteAnchor = null;
let readerLayer = 'base';
let currentReadingItem = 'wheel-speeds';
let noteDraft = '';
let readerPanelOpen = false;
let readerPanelTab = 'notes';
let selectedAnchor = null;
let followUp = '';
let entryMode = 'topic';
let guideActive = false;
let toolMode = 'embedded';
let wheelRatio = 1.35;
let visualRatio = 1.35;
let canvasZoom = 1;
let nextSteps = new Set();
const humanEntries = JSON.parse($('#preserved-user-work').textContent).notes.map(text=>({id:crypto.randomUUID(),kind:'observation',text}));
let capturedResults = [];
const defaultInsight = 'I need to test the turning radius at the speed I actually plan to drive, rather than judging the controller from a stationary demo.';
const externalEvidence = (result) => /^https?:\/\//i.test(result.url || '') ? `<p><a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">Open returned result ${icon('out')}</a></p>` : '';
const screenById = (id) => screens.find((screen) => screen.id === id);
const announce = (message) => { $('#announcement').textContent = message; };
function renderSidebar() {
 $('.brand').setAttribute('aria-label','Applied Research');$('.brand').title='Projects';
 $('.sidebar-utilities button').setAttribute('aria-label','Find in project');$('.sidebar-utilities button').title='Find in project';
 $('#profile-trigger').title='Your profile';
 $('#learning-outline').innerHTML = `<p class="outline-caption">Topics <span>Synthetic example</span></p>${learningTopics.map(topic=>`<details class="topic-group" ${topic.id==='motion'?'open':''}><summary>${icon('back')}<span>${topic.title}</span></summary><div class="topic-items">${topic.items.map(item=>`<button data-learning-item="${item.id}">${icon(item.glyph)}<span>${item.title}${item.preview?'<small>Preview</small>':''}</span></button>`).join('')}</div></details>`).join('')}`;
 $('#product-nav').innerHTML = workspaceViews.map(([id,glyph,title])=>`<button data-view="${id}" aria-label="${title}" title="${title}">${icon(glyph)}<span>${title}</span></button>`).join('');
}
function updateSidebarSelection() {
 const activeItem = learningItems.find(item=>view==='reader'?item.layer===readerLayer:view==='practical'&&item.tool===toolMode);
 if (view==='reader' && activeItem) currentReadingItem=activeItem.id;
 document.querySelectorAll('#learning-outline [data-learning-item]').forEach(button=>{
  const active=button.dataset.learningItem===activeItem?.id;
  button.classList.toggle('is-reading',button.dataset.learningItem===currentReadingItem);
  if(active){button.setAttribute('aria-current','page');button.closest('details').open=true;}
  else button.removeAttribute('aria-current');
 });
 document.querySelectorAll('#product-nav [data-view],#profile-menu [data-view]').forEach(button=>{
  if(button.dataset.view===view)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 });
}
function openLearningItem(id) {
 const item=learningItems.find(item=>item.id===id);
 if(!item)return;
 if(item.layer)readerLayer=item.layer;
 if(item.tool)toolMode=item.tool;
 setView(item.tool?'practical':'reader',item.layer);
 $('#stage').focus({preventScroll:true});
}
function renderTopicPreview(item) {
 return header('Topic preview')+`<div class="reader-layout"><article class="article topic-preview"><h1>${item.title}</h1><p>${item.preview}</p><div class="topic-preview-note"><p class="small muted">Example outline · activity not built</p><p>${item.id==='drifting-path'?'Drive toward a target, compare expected and observed motion, then adjust the feedback gain. This activity is not built in this prototype.':'The wheel-speed example shows ideal geometry. Tire slip and uneven terrain are not modeled in this prototype; a real-floor comparison remains open.'}</p></div><div class="actions"><button class="outline" data-learning-item="${item.id==='drifting-path'?'try-wheels':'return-result'}">${item.id==='drifting-path'?'Try wheel speeds':'Bring back a result'} ${icon('arrow')}</button><button class="quiet" data-learning-item="wheel-speeds">Read the motion model</button></div></article></div>`;
}
function header(title, actions = '') { return `<header class="workspace-header"><div class="workspace-heading">${workspacePrototype.toolbar()}<strong>${title}</strong><span class="small muted">Learning robotics</span></div><div class="actions">${workspacePrototype.globalActions()}${actions}<button class="icon-button" data-action="theme" aria-label="Switch to ${theme === 'dark' ? 'light' : 'dark'} theme">${icon('sun')}</button></div></header>`; }
function setView(nextView, nextReaderLayer = 'base', readingAnchor = null) {
 if (!screenById(nextView)) return;
 workspacePrototype.beforeNavigate(nextView,nextReaderLayer,readingAnchor);
 if($('#highlight-tools').matches(':popover-open'))$('#highlight-tools').hidePopover();
 selectedAnchor=null;
 const profileWasOpen = $('#profile-menu').matches(':popover-open');
 if(profileWasOpen)$('#profile-menu').hidePopover();
 view = nextView;
 if(view==='reader')readerLayer=nextReaderLayer;
 $('#screen-select').value = view;
 $('#app').classList.toggle('opening',view === 'opening');
 $('#app').classList.toggle('canvas-focused',view === 'canvas');
 $('#sidebar').hidden = view === 'opening';
 updateSidebarSelection();
 $('#stage').classList.toggle('canvas-stage',view==='canvas');
 $('#stage').innerHTML = renderers[view]();
 $('#stage').scrollTop = 0;
 if (view === 'canvas') workspacePrototype.bindCanvas();
 workspacePrototype.afterNavigate();
 if(profileWasOpen)$('#stage').focus({preventScroll:true});

}
function renderOpening() {
 return `<section class="opening-scene" aria-label="Start learning"><img class="opening-art" src="assets/apple-landscape.webp" alt="An apple tree overlooks a mountain valley; a red apple falls through the open sky."><div class="opening-brand">Applied Research</div><div class="opening-content"><form class="opening-form" id="learning-form"><div class="learning-input"><label class="sr-only" for="learning-topic">What do you want to learn about?</label><span class="learning-placeholder" aria-hidden="true">I want to learn about…</span><textarea id="learning-topic" rows="1" required></textarea></div><div class="actions"><button class="opening-option" type="button" data-entry="topic" aria-pressed="true">Explore a topic</button><button class="opening-option" type="button" data-entry="project" aria-pressed="false">Build something</button><button class="opening-option" type="button" data-entry="source" aria-pressed="false">Start from a source</button><button class="opening-submit" type="submit" aria-label="Start learning" disabled>${icon('arrow')}</button></div><div class="opening-file" id="opening-source" hidden><label class="sr-only" for="opening-url">Source URL</label><input type="url" id="opening-url" placeholder="Paste a source URL"></div></form><nav class="opening-projects" aria-labelledby="opening-projects-title"><h2 id="opening-projects-title">Your projects</h2><button class="returning" data-view="reader"><span><span class="small">Continue learning · Example</span><span class="returning-name">A robot that can find its way</span></span>${icon('arrow')}</button></nav></div></section>`;
}
function visualSvg(ratio, id='robot-position') {
 const curve = Math.round((ratio - 1) * 105);
 return `<svg class="robot-chart" viewBox="0 0 440 190" role="img" aria-label="Simplified differential-drive path"><path d="M45 156H410M62 172V22" stroke="var(--line)" fill="none"/><path d="M82 144 Q220 144 360 ${144-curve}" stroke="var(--cold)" stroke-width="2" fill="none" stroke-dasharray="5 4"/><g id="${id}" transform="translate(290 ${144-curve*.56}) rotate(${-curve*.18})"><rect x="-18" y="-15" width="36" height="30" rx="8" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5"/><path d="M-12-19H12M-12 19H12m-2-4 5-5-5-5" stroke="var(--ink)" fill="none" stroke-width="2"/></g><text x="70" y="30">Illustrative path · no floor friction</text><text x="330" y="178">distance →</text></svg>`;
}
function renderExplanation() {
 if (!explanationVisible) return `<button class="closed-explanation" data-action="expand-explanation"><span>Why does changing one wheel make it turn?</span>${icon('plus')}</button>`;
 let content = '';
 if (explanationState === 'loading') content = `<div class="waiting"><svg viewBox="0 0 50 40" aria-hidden="true"><path class="trace-back" d="M5 30C5 5 45 5 45 30M5 30H45"/><path d="M5 30C5 5 45 5 45 30M5 30H45"/></svg><span>Building the explanation…</span></div><button class="quiet" data-action="explanation-ready">Preview completed explanation ${icon('arrow')}</button>`;
 else if (explanationState === 'failed') content = `<p>The visual couldn’t load.</p><div class="actions"><button class="outline" data-action="explanation-retry">Try again</button><button class="quiet" data-action="explanation-text">Read the explanation</button></div>`;
 else if (explanationState === 'unsupported') content = `<p>This visual can show ideal wheel motion. It can’t model tire slip or uneven terrain.</p><button class="outline" data-action="explanation-text">Read the supported explanation ${icon('arrow')}</button>`;
 else content = `<p>The two wheels move the same body. When one travels farther, the body turns as it moves. Change the difference between the wheel speeds and watch the path bend.</p>${explanationState==='text'?'':`<div class="visual-demo">${visualSvg(visualRatio)}<div class="visual-controls"><span>Wheel speed difference</span><input type="range" min="1" max="2" step=".05" value="${visualRatio}" id="visual-ratio" aria-label="Wheel speed difference"></div></div>`}<div class="actions"><button class="quiet" data-action="follow-up">Ask follow-up</button><button class="quiet" data-action="compose-note">${icon('note')} Note</button><button class="quiet" data-learning-item="try-wheels">Try it ${icon('arrow')}</button></div><div id="follow-up-slot">${followUp}</div>`;
 return `<section class="explanation" aria-label="Inline explanation"><div class="row"><p class="question">Why does changing one wheel make it turn?</p><button class="icon-button" data-action="collapse-explanation" aria-label="Collapse explanation">${icon('close')}</button></div><div class="credit">AI explanation · illustrative content</div>${content}</section>`;
}
const ideaSources = [
 {id:'lesson-motion',title:'Wheel speeds and turning',origin:'Generated lesson · example',layer:'base',passages:[
  'A differential-drive robot steers by changing how fast its left and right wheels move. Equal forward speeds give a straight path. A difference between them creates a turn.',
  'When the right wheel travels faster than the left, the robot curves toward the slower wheel. The larger the difference, the tighter the turn in the ideal model.',
 ]},
 {id:'lesson-radius',title:'Turning radius',origin:'Generated lesson · example',layer:'deeper',passages:[
  'In the ideal model, both wheels trace circles around the same turning center. The wheel farther from that center has a longer path to cover in the same time.',
  'That geometric relationship connects the wheel speeds, the distance between the wheels, and the radius of the turn.',
 ]},
 {id:'import-example',originItemId:'real-floor',title:'Robot test notebook',origin:'Imported source · synthetic example',passages:[
  'On the smooth test surface, repeated wheel commands produced similar turning paths.',
  'On the rough surface, the same commands produced different final headings across repeated runs.',
 ]},
 {id:'openalex-example',originItemId:'wheel-speeds',title:'Wheel contact and motion',origin:'OpenAlex discovery · synthetic example',passages:[
  'A wheel-speed model describes commanded motion under an assumption of rolling without slip.',
  'When contact conditions change, measured motion can depart from the path predicted by wheel commands.',
 ]},
 {id:'semantic-example',originItemId:'drifting-path',title:'Feedback during a turn',origin:'Semantic Scholar discovery · synthetic example',passages:[
  'A feedback controller compares a measured heading with a target heading during the maneuver.',
  'Correcting heading error during a run serves a different purpose from predicting a path before the run.',
 ]},
];
const sourceFor = anchor => ideaSources.find(source=>source.id===anchor.sourceId);
const savedNotes = () => humanEntries.filter(entry=>entry.kind==='note');
const savedSupportEntries = () => [...savedNotes(),...workspacePrototype.questionEntries()];
const savedInsights = () => humanEntries.filter(entry=>entry.kind==='insight');
const entryLabel = entry => ({note:'Your note',question:'Your question',insight:'Your insight',observation:'Your observation'}[entry.kind]);
const linkedEntries = entry => (entry.supportIds||[]).map(id=>savedSupportEntries().find(note=>note.id===id)).filter(Boolean);
function passageAnchor(source,index) {
 return {sourceId:source.id,version:'prototype-v1',passage:index,start:0,end:source.passages[index].length,quote:source.passages[index]};
}
function renderAnchorLinks(anchors) {
 return `<ol class="insight-links">${anchors.map(anchor=>{const source=sourceFor(anchor);return `<li><button type="button" data-action="inspect-anchor" data-source-id="${anchor.sourceId}" data-passage="${anchor.passage}" data-quote="${escapeHtml(anchor.quote)}"><span class="anchor-origin">${escapeHtml(source.origin)}</span><strong>${escapeHtml(source.title)} · ¶${anchor.passage+1}</strong><q>${escapeHtml(anchor.quote)}</q></button></li>`;}).join('')}</ol>`;
}
function renderNoteComposer() {
 if(!noteComposerOpen)return '';
 return `<form class="note-composer" id="note-form"><h3>Put it in your own words</h3>${draftNoteAnchor?`<div class="note-context"><span class="anchor-origin">${escapeHtml(sourceFor(draftNoteAnchor).origin)}</span><strong>${escapeHtml(sourceFor(draftNoteAnchor).title)} · ¶${draftNoteAnchor.passage+1}</strong><blockquote>${escapeHtml(draftNoteAnchor.quote)}</blockquote></div>`:'<p class="small muted">Highlight source text, then click Note. You can also choose a passage below.</p><button type="button" class="outline" data-action="choose-source-passage">Choose a passage</button>'}<label for="human-note">Your note</label><textarea id="human-note" placeholder="What does this mean in your own words?" required>${escapeHtml(noteDraft)}</textarea><div class="actions"><button class="primary" id="save-note" type="submit" ${!draftNoteAnchor||!noteDraft.trim()?'disabled':''}>Save note ${icon('check')}</button><button class="quiet" type="button" data-action="cancel-note">Cancel</button></div></form>`;
}
function supportOrigin(entry) {return entry.anchor?sourceFor(entry.anchor).title:entry.origin.title;}
function renderLinkedNotes(entry) {
 return `<ol class="linked-notes">${linkedEntries(entry).map(note=>note.kind==='question'?`<li><span class="anchor-origin">Your question · ${escapeHtml(supportOrigin(note))}</span><p>${escapeHtml(note.text)}</p><button class="quiet" data-workspace-action="open-branch" data-branch-id="${note.id}">Open question ${icon('arrow')}</button></li>`:`<li><span class="anchor-origin">Your note · ${escapeHtml(sourceFor(note.anchor).title)}</span><p>${escapeHtml(note.text)}</p><details><summary>Source highlight</summary>${renderAnchorLinks([note.anchor])}</details></li>`).join('')}</ol>`;
}
function renderEntryLinks(entry) {
 return entry.kind==='insight'?renderLinkedNotes(entry):entry.anchor?renderAnchorLinks([entry.anchor]):'';
}
function renderSavedNotes() {
 return savedNotes().map(note=>`<section class="rail-note"><p>${escapeHtml(note.text)}</p><span class="anchor-origin">Your note · ${escapeHtml(sourceFor(note.anchor).title)}</span><details><summary>Source highlight</summary>${renderAnchorLinks([note.anchor])}</details><button class="quiet" data-action="insight-from-note" data-note-id="${note.id}">Link into an insight ${icon('link')}</button></section>`).join('');
}
function renderInsightComposer() {
 if(!insightComposerOpen)return '';
 return `<form class="note-composer" id="insight-form"><h3>Connect notes and questions</h3><p class="small muted">Choose at least two notes or questions you’ve saved, then explain the connection.</p>${renderLinkedNotes({supportIds:draftSupportIds})}<button type="button" class="outline link-notes" data-action="choose-notes" ${savedSupportEntries().length?'':'disabled'}>${icon('plus')} ${draftSupportIds.length?'Change linked entries':'Choose notes or questions'}</button><p class="small muted" id="note-count" role="status">${draftSupportIds.length} entries linked · ${draftSupportIds.length>=2?'ready to connect':'at least 2 required'}</p>${savedSupportEntries().length<2?'<p class="small muted">Start by highlighting text and saving notes in your own words.</p><button type="button" class="quiet" data-action="compose-note">Take a note</button>':''}<label for="human-insight">Your insight</label><textarea id="human-insight" required placeholder="What do these ideas help you see together?">${escapeHtml(insightDraft)}</textarea><div class="actions"><button class="primary" id="save-insight" type="submit" ${draftSupportIds.length<2||!insightDraft.trim()?'disabled':''}>Save insight ${icon('check')}</button><button type="button" class="quiet" data-action="cancel-insight">Cancel</button></div></form>`;
}
function renderSavedInsights() {
 return savedInsights().map(entry=>`<section class="rail-note"><p>${escapeHtml(entry.text)}</p><footer><span>Your insight</span><span>${entry.supportIds.length} linked entries</span></footer>${renderLinkedNotes(entry)}</section>`).join('');
}
function showSourcePassages(sourceId=ideaSources[0].id) {
 const source=ideaSources.find(item=>item.id===sourceId)||ideaSources[0];
 $('#idea-dialog-content').innerHTML=`<h2 id="idea-dialog-title">Read and take a note</h2><p class="small muted">Highlight the part you want to summarize, or take a note on a whole passage.</p><label for="idea-source">Source material</label><select id="idea-source">${ideaSources.map(item=>`<option value="${item.id}" ${item.id===source.id?'selected':''}>${escapeHtml(item.title)} — ${escapeHtml(item.origin)}</option>`).join('')}</select><p class="small muted source-demo-notice">${source.layer?'Generated lesson example.':'Synthetic source text for this preview. No import, search or full-text extraction has run.'}</p><button class="quiet" data-workspace-action="read-source" data-source-id="${source.id}">Open in Reader ${icon('arrow')}</button><div class="source-passages">${source.passages.map((quote,index)=>`<section><span class="anchor-origin">${escapeHtml(source.origin)} · ¶${index+1}</span><p data-source-id="${source.id}" data-passage="${index}">${escapeHtml(quote)}</p><button class="outline" data-action="note-on-passage" data-source-id="${source.id}" data-passage="${index}">Note on this passage</button></section>`).join('')}</div>`;
 if(!$('#idea-dialog').open)$('#idea-dialog').showModal();
}
function showNotesPicker() {
 $('#idea-dialog-content').innerHTML=`<h2 id="idea-dialog-title">Link notes and questions</h2><p class="small muted">Choose notes or questions whose ideas you want to connect.</p><fieldset class="note-choices"><legend class="sr-only">Saved notes and questions</legend>${savedSupportEntries().map(note=>`<label class="note-choice"><input type="checkbox" data-link-note="${note.id}" ${draftSupportIds.includes(note.id)?'checked':''}><span><span class="note-choice-text">${escapeHtml(note.text)}</span><span class="anchor-origin">${entryLabel(note)} · ${escapeHtml(supportOrigin(note))}</span></span></label>`).join('')}</fieldset><p class="small muted" id="picker-status" role="status">${draftSupportIds.length} entries linked</p><button class="primary" data-close="idea-dialog">Done</button>`;
 $('#idea-dialog').showModal();
}
function inspectAnchor(button) {
 const source=ideaSources.find(item=>item.id===button.dataset.sourceId);const passage=Number(button.dataset.passage);const quote=button.dataset.quote;const start=source.passages[passage].indexOf(quote);
 workspacePrototype.openAnchor({...passageAnchor(source,passage),quote,start,end:start+quote.length});
}
function renderReaderPanel() {
 const tabs=[['notes',`Notes ${savedNotes().length}`],['insights',`Insights ${savedInsights().length}`],['sources','Sources']];
 let content='';
 if(readerPanelTab==='notes')content=`${renderNoteComposer()}${renderSavedNotes()}${!savedNotes().length&&!noteComposerOpen?'<p class="rail-empty">Highlight a passage and click Note to summarize it in your own words.</p>':''}${!noteComposerOpen?`<button class="rail-record outline" data-action="compose-note">${icon('plus')} Take a note</button>`:''}${savedNotes().length?`<button class="rail-record quiet" data-action="compose-insight">Connect your notes ${icon('link')}</button>`:''}`;
 if(readerPanelTab==='insights')content=`${renderInsightComposer()}${renderSavedInsights()}${!savedInsights().length&&!insightComposerOpen?'<p class="rail-empty">Insights connect your saved notes and questions.</p>':''}${!insightComposerOpen?`<button class="rail-record outline" data-action="compose-insight">${icon('plus')} Create insight</button>`:''}`;
 if(readerPanelTab==='sources')content=`<button class="reader-source" data-action="source"><span><strong>Modern Robotics</strong><span>Wheeled mobile robots · Chapter 13</span></span>${icon('out')}</button><button class="outline rail-record" data-action="choose-source-passage">Read source examples</button>`;
 return `<aside class="reader-aside" aria-label="Reader workspace"><div class="reader-panel-header"><div class="reader-panel-tabs" role="tablist" aria-label="Reader workspace">${tabs.map(([id,title])=>`<button role="tab" id="${id}-tab" tabindex="${id===readerPanelTab?'0':'-1'}" aria-controls="reader-panel-content" aria-selected="${id===readerPanelTab}" data-reader-tab="${id}">${title}</button>`).join('')}</div><button class="icon-button reader-panel-close" data-action="close-reader-panel" aria-label="Close Reader panel">${icon('close')}</button></div><div id="reader-panel-content" role="tabpanel" aria-labelledby="${readerPanelTab}-tab">${content}</div><div class="reader-panel-footer"><button data-view="canvas">${icon('canvas')} Open Canvas ${icon('arrow')}</button><button data-learning-item="try-wheels">${icon('tool')} Try wheel speeds ${icon('arrow')}</button></div></aside>`;
}
function renderReader() {
 const contextReader=workspacePrototype.renderContextReader();if(contextReader)return contextReader;
 const preview = learningItems.find(item=>item.layer===readerLayer && item.preview);
 if (preview) return renderTopicPreview(preview);
 const deep = readerLayer === 'deeper';
 return header('Reader',`<button class="quiet" data-action="compose-note">${icon('note')} Note</button><button class="icon-button" data-action="reader-sources" aria-label="Show sources">${icon('book')}</button><button class="icon-button" data-action="finder" aria-label="Find in project">${icon('search')}</button>`)+`<div class="reader-layout" data-panel-open="${readerPanelOpen}"><article class="article">${deep?`<button class="quiet" data-action="reader-back">${icon('back')} Back to wheel speeds</button>`:''}<h1>${deep?'Where does the turning radius come from?':'Wheel speeds and turning'}</h1>${deep?`<p>In the ideal model, both wheels trace circles around the same turning center. The wheel farther from that center has a longer path to cover in the same time.</p><p>That geometric relationship connects the wheel speeds, the distance between the wheels, and the radius of the turn.</p><div class="explanation"><p class="question">R = (L / 2) × (v<sub>right</sub> + v<sub>left</sub>) / (v<sub>right</sub> − v<sub>left</sub>)</p><p>Equal wheel speeds give straight motion; the turning radius is unbounded. This idealized relationship does not account for wheel slip.</p></div>`:`<p>A differential-drive robot steers by changing how fast its left and right wheels move. Equal forward speeds give a straight path. A difference between them creates a turn.</p><p><span class="passage">When the right wheel travels faster than the left, the robot curves toward the slower wheel.</span> The larger the difference, the tighter the turn in the ideal model.</p><div class="passage-tools" aria-label="Passage actions"><button data-action="explain">${icon('play')} Explain</button><button data-action="compose-note">${icon('note')} Note</button><button data-action="reader-deeper">Go deeper ${icon('arrow')}</button></div><div id="explanation-slot">${renderExplanation()}</div><p>This gives you a useful first experiment: hold the left wheel speed steady, change the right wheel speed, and compare the path each time.</p>`}<h2>Take the idea into a test</h2><p>Start with the clean model. Then test what happens when the wheels meet an uneven surface. Keep the difference between what you predicted and what you observed.</p><div class="actions"><button class="outline" data-learning-item="try-wheels">Try wheel speeds ${icon('arrow')}</button><button class="quiet" data-action="source">Inspect the source</button></div></article>${renderReaderPanel()}</div>`;
}
function renderCanvas() {return workspacePrototype.renderCanvas();}
function renderPractical() {
 return header('Practical work',`<button class="quiet" data-action="tool-mode">${icon('out')} ${toolMode==='embedded'?'External tool flow':'Back to experiment'}</button>`)+`<div class="practical-layout"><section class="tool-area"><h1>${toolMode==='embedded'?'Try wheel speeds':'Bring back a result'}</h1><p class="muted">${toolMode==='embedded'?'Keep one wheel steady. Change the other and compare the path.':'Attach a run from your own simulator or robot, with your observation.'}</p>${toolMode==='embedded'?`<div class="tool-frame"><div class="tool-bar">${icon('tool')} Differential drive <span class="muted">· reusable explanation</span></div><div class="tool-scene" id="tool-scene">${visualSvg(wheelRatio,'experiment-robot')}</div><div class="experiment-controls"><label>Right wheel / left wheel <output id="wheel-output">${wheelRatio.toFixed(2)}×</output></label><label>Wheel speed ratio <input id="wheel-ratio" type="range" min="1" max="2" step=".05" value="${wheelRatio}"></label><div class="actions"><button class="primary" data-action="capture-result">Capture result ${icon('plus')}</button><button class="quiet" data-action="reset-experiment">Reset</button></div></div></div><p class="small muted">Illustrative geometry. Use an external simulation or robot to test real dynamics.</p>`:`<div class="tool-frame"><div class="tool-bar">${icon('out')} External tool</div><div class="tool-fallback"><h2>Continue in your tool</h2><p>Use your simulator or robot, then attach the result to this learning step.</p><a class="outline primary" href="https://modernrobotics.northwestern.edu/nu-gm-book-resource/chapter-13-1-wheeled-mobile-robots/" target="_blank" rel="noopener">Open related resource ${icon('out')}</a><form id="result-form"><label for="result-link">Result link</label><input type="url" id="result-link" placeholder="https://…" required><label for="result-note">What happened?</label><textarea id="result-note" rows="3" style="width:100%" required placeholder="Describe what you observed."></textarea><button class="primary" type="submit" style="margin-top:16px">Attach result ${icon('link')}</button></form></div></div>`}<div id="result-receipts">${renderResults()}</div></section><aside class="guide"><h2>Work through it</h2><p>Predict the path before changing the wheel speeds. Then compare what happened.</p><button class="${guideActive?'outline':'primary'}" data-action="guide">${guideActive?'Stop guidance':'Guide me through this'} ${icon(guideActive?'close':'arrow')}</button><div class="guide-status">${guideActive?'Guidance active for this example activity':'Guidance is off'}</div>${guideActive?`<p>Start with equal wheel speeds. What do you expect to change when you increase only the right wheel?</p><p class="small muted">Prototype demonstration; no screen is being observed.</p>`:`<p class="small muted">A guided activity begins only when you start it. You can stop at any time.</p>`}<div class="rule"><h3>Keep an observation</h3><form id="observation-form"><label class="sr-only" for="observation">Your observation</label><textarea id="observation" placeholder="I expected… I observed…" required></textarea><div class="actions"><button class="outline" type="submit">Save observation ${icon('note')}</button></div></form></div><div class="rule"><button class="quiet" data-view="canvas">See the connection on Canvas ${icon('arrow')}</button></div></aside></div>`;
}
function renderResults() {return capturedResults.map((result,index)=>`<section class="result-receipt"><h3>${icon('check')} ${result.kind==='experiment'?'Wheel-speed comparison':'Returned result'} ${index+1}</h3><p>${escapeHtml(result.text)}</p>${externalEvidence(result)}<p class="muted small">${result.kind==='experiment'?'Captured from this illustrative experiment':'Your observation · linked external result'} · <button class="quiet" data-view="playbook">View in Playbook</button></p></section>`).join('');}
function renderPlaybook() {
 return header('Playbook',`<button class="quiet" data-action="export-playbook">${icon('download')} Export</button>`)+`<div class="page"><div class="page-head"><div><h1 class="playbook-title">Building a robot that can find its way</h1><p class="muted">What you learned, what you tried, and where you go next.</p></div></div><div class="playbook-columns"><div><section class="playbook-section"><h2>What changed my thinking</h2>${humanEntries.length?humanEntries.map(entry=>`<p>${escapeHtml(entry.text)}</p><div class="small muted">${entryLabel(entry)} · saved during this prototype</div>${renderEntryLinks(entry)}`).join(''):`<p>${defaultInsight}</p><div class="small muted">Example insight · replace by saving your own in Reader or Practical work</div>`}<button class="quiet" data-view="canvas">Trace the idea ${icon('arrow')}</button></section><section class="playbook-section"><h2>What I can support so far</h2><p>Start with an ideal motion model. Choose the controller using evidence from the environment where the robot will actually work.</p><div class="small muted">Example thesis · the real-floor comparison is still open</div></section><section class="playbook-section"><h2>What I tried</h2>${capturedResults.length?capturedResults.map((result,i)=>`<div class="evidence-row">${icon('tool')}<div><h3>${result.kind==='experiment'?'Wheel-speed comparison':'Returned result'} ${i+1}</h3><p>${escapeHtml(result.text)}</p>${externalEvidence(result)}<button data-view="practical">Revisit the work ${icon('arrow')}</button></div></div>`).join(''):`<div class="empty-state"><h3>No results captured yet</h3><p>Capture a wheel-speed comparison or attach a result from your own tool.</p><button class="outline" data-view="practical">Try the experiment ${icon('arrow')}</button></div>`}</section></div><aside><section class="playbook-section"><h2>Concrete next steps</h2><ul class="next-list">${['Compare three wheel-speed ratios.','Run the same turn on the intended floor.','Record the drift before changing the controller.'].map((step,i)=>`<li><input type="checkbox" id="step-${i}" data-next="${i}" ${nextSteps.has(i)?'checked':''}><label for="step-${i}">${step}</label></li>`).join('')}</ul></section><section class="playbook-section"><h3>Still an open question</h3><p class="small muted">How much of the drift comes from wheel slip, and how much from the command itself?</p><button class="quiet" data-view="reader">Explore the model ${icon('arrow')}</button></section><section class="playbook-section"><h3>Sources</h3><button class="quiet" data-action="source">Modern Robotics ${icon('out')}</button></section></aside></div></div>`;
}
function renderSettings() {
 return header('Settings')+`<div class="page settings-page"><h1>Settings</h1><section class="setting-row"><div><h3>Appearance</h3><p>Use the same reading and interface palette across every workspace.</p></div><div class="segmented" aria-label="Theme"><button data-theme="light" aria-pressed="${theme==='light'}">Light</button><button data-theme="dark" aria-pressed="${theme==='dark'}">Dark</button></div></section><section class="setting-row"><div><h3>Motion</h3><p>Explanations open in place. This prototype respects your system’s reduced-motion preference.</p></div><span class="small muted">System preference</span></section><section class="setting-row"><div><h3>AI provider</h3><p>OpenRouter is the selected MVP provider. Connection settings belong here in the product.</p></div><span class="priority-badge">Not connected in prototype</span></section><section class="setting-row"><div><h3>Activity guidance</h3><p>Starts only for an activity you explicitly ask to be guided through. Stop it from the activity.</p></div><button class="outline" data-view="practical">Try guidance</button></section><section class="setting-row"><div><h3>Saved work</h3><p>This prototype’s notes and results are temporary. Export your Playbook to keep them. Screen-review decisions save separately on this Mac.</p></div><button class="outline" data-action="export-playbook">Export Playbook</button></section><section class="setting-row"><div><h3>Offline access</h3><p>Product requirement: read and edit saved Canvas work, notes and insights offline. New AI responses need a connection.</p></div><span class="priority-badge">Required for MVP</span></section><section class="setting-row"><div><h3>Sync</h3><p>Not selected. No cloud synchronization is implied by this design.</p></div><span class="small muted">Undecided</span></section></div>`;
}
function renderComponents() {
 return header('Reusable components',`<button class="quiet" data-view="coverage">Screen coverage ${icon('arrow')}</button>`)+`<div class="page"><h1>One system, across the work</h1><p class="lead">Claude’s type and palette. Field Atlas’s rounded controls and icon treatment.</p><section class="component-group"><div><h2>Typography</h2><p class="description">Newsreader for reading and human notes. Familjen Grotesk for UI and AI. Fraunces for the project brief. Martian Mono for navigation and coordinates.</p></div><div><p class="type-specimen">Understand the idea.<br>Try it in the world.</p><p class="brief-specimen">A robot that can find its way</p><p class="type-body-specimen">A reading paragraph uses Newsreader at 18px, with room to follow the idea.</p><p>AI explanation and interface text use Familjen Grotesk at 13–14px.</p><p class="coordinate">Reader · Chapter 13</p></div></section><section class="component-group"><div><h2>Color</h2><p class="description">Basalt or warm paper. Warm marks for human contributions; cool interaction accents.</p></div><div class="swatches">${[['Ground','--ground'],['Surface','--surface'],['Text','--ink'],['Human','--warm'],['Interaction','--cold']].map(([title,token])=>`<div class="swatch"><span style="background:var(${token})"></span>${title}</div>`).join('')}</div></section><section class="component-group"><div><h2>Controls</h2><p class="description">6px controls, 12px panels, 1.5px stroke icons. No spine or depth path bar.</p></div><div><div class="actions"><button class="primary" data-action="component-save">Save insight ${icon('check')}</button><button class="outline" data-action="source">Source ${icon('out')}</button><button class="quiet" data-view="reader">Back to Reader</button><button disabled>Saved</button></div><p id="component-save-state" class="saved-message" role="status" style="margin-top:12px"></p><div class="passage-tools"><button data-view="reader">${icon('play')} Explain</button><button data-view="reader">${icon('note')} Note</button><button data-view="canvas">${icon('canvas')} Canvas</button></div><label for="component-input" class="small muted">Ask about a passage</label><input id="component-input" style="display:block;width:100%;margin-top:8px" placeholder="What changes when…"></div></div></section><section class="component-group"><div><h2>Attribution</h2><p class="description">Concise labels separate AI contributions, human writing and captured evidence.</p></div><div><div class="explanation" style="margin-top:0"><div class="credit">AI explanation</div><p>The two wheels move the same body. A difference in their speeds creates a turn.</p></div><div class="human-note"><p>I should test at the speed I plan to use.</p><footer>Your insight · linked to the experiment</footer></div></div></section><section class="component-group"><div><h2>Explanation states</h2><p class="description">The same panel handles waiting, fallback and recovery with direct copy.</p></div><div><div class="state-specimen"><div class="waiting"><svg viewBox="0 0 50 40" aria-hidden="true"><path class="trace-back" d="M5 30C5 5 45 5 45 30M5 30H45"/><path d="M5 30C5 5 45 5 45 30M5 30H45"/></svg><span>Building the explanation…</span></div><button class="quiet" data-preview-state="loading">See in Reader</button></div><div class="state-specimen"><p>The visual couldn’t load.</p><button class="outline" data-preview-state="failed">Review retry state</button></div><div class="state-specimen"><p>This visual can’t model tire slip.</p><button class="outline" data-preview-state="unsupported">Review supported fallback</button></div><div class="state-specimen"><p>You’re offline. Saved work is available.</p><button class="quiet" data-view="canvas">Open Canvas ${icon('arrow')}</button></div></div></section><section class="component-group"><div><h2>Sources & finding</h2><p class="description">Compact preview and a keyboard-accessible finder. Source links remain explicit.</p></div><div class="actions"><button class="outline" data-action="source">Open source preview ${icon('out')}</button><button class="outline" data-action="finder">${icon('search')} Find anything <kbd>⌘K</kbd></button></div></section></div>`;
}
function renderCoverage() {
 const rows=[['opening','Opening & resume','MVP','Input, options, returning project.'],['reader','Reader + learning path','MVP proposal','Persistent topic outline, reading, depth, practical links and clearly labeled previews.'],['canvas','Canvas','MVP','Horizontal connections, movable cards, zoom, inspection.'],['practical','Practical work','MVP','Reusable visual, explicit guidance, external return, result capture.'],['playbook','Playbook','MVP core','Evidence, insights, thesis, next steps and text export.'],['settings','Settings','MVP core','Appearance, provider boundary, offline work; sync undecided.'],['components','Reusable components','MVP','Type, color, controls, attribution, sources, finder and states.']];
 return header('Screen coverage')+`<div class="page"><h1>Full desktop scope</h1><p class="lead">A connected first pass. These priorities are proposed, and the assembled screens are ready for your review.</p><table class="coverage"><caption>Current MVP implementation is separate from this design prototype. None of the proposals below represent a final approval.</caption><thead><tr><th>Screen</th><th>Proposed priority</th><th>Included in this review</th></tr></thead><tbody>${rows.map(([id,title,priority,details])=>`<tr><td><button data-view="${id}">${title} ${icon('arrow')}</button></td><td>${priority}</td><td>${details}</td></tr>`).join('')}</tbody></table><section class="rule"><h2>Still to resolve before final approval</h2><ul class="quiet-list"><li>Exact observation and cursor-companion behavior inside an explicitly guided activity.</li><li>Source import, extraction and partial-content states across supported formats.</li><li>Editing/adoption rules for AI-proposed insights and the final attribution/export treatment.</li><li>Returning results from specific third-party tools, including account and embedding failures.</li><li>Empty, deleted, offline-conflict and recovery states for the final persistence architecture.</li><li>Whether Playbook is always assembled live, explicitly compiled, or both.</li></ul><p class="small muted">The separate academic Writing/Workbench screens are removed. Insight writing is part of Reader and Practical work; Canvas and Playbook show the connected result.</p></section><button class="primary" data-action="review">Review priorities ${icon('arrow')}</button></div>`;
}
const renderers={opening:renderOpening,reader:renderReader,canvas:renderCanvas,practical:renderPractical,playbook:renderPlaybook,settings:renderSettings,components:renderComponents,coverage:renderCoverage};
function refreshExplanation() { $('#explanation-slot').innerHTML=renderExplanation(); }
function refreshReaderPanel() {
 $('.reader-layout').dataset.panelOpen=String(readerPanelOpen);
 $('.reader-aside').outerHTML=renderReaderPanel();
}
function showNoteComposer() {
 if(selectedAnchor){
  if(noteDraft.trim()&&draftNoteAnchor&&JSON.stringify(draftNoteAnchor)!==JSON.stringify(selectedAnchor))announce('Finish or cancel your current note before starting a note on another highlight.');
  else draftNoteAnchor={...selectedAnchor};
 }
 selectedAnchor=null;
 $('#highlight-tools').hidePopover();
 if($('#idea-dialog').open)$('#idea-dialog').close();
 noteComposerOpen=true;readerPanelOpen=true;readerPanelTab='notes';
 if(view!=='reader'||!$('.reader-aside'))setView('reader');
 refreshReaderPanel();$('#human-note').focus({preventScroll:true});
}
function showInsightComposer() {
 insightComposerOpen=true;readerPanelOpen=true;readerPanelTab='insights';refreshReaderPanel();$('#human-insight').focus({preventScroll:true});
}
function saveSourceNote(text) {
 if(!text.trim()||!draftNoteAnchor)return false;
 humanEntries.push({id:crypto.randomUUID(),kind:'note',text:text.trim(),anchor:{...draftNoteAnchor}});
 announce('Note saved in your own words, linked to the source highlight.');return true;
}
function saveInsight(text) {
 const supportIds=[...new Set(draftSupportIds)].filter(id=>savedSupportEntries().some(note=>note.id===id));
 if(!text.trim()||supportIds.length<2)return false;
 humanEntries.push({id:crypto.randomUUID(),kind:'insight',text:text.trim(),supportIds});
 announce('Insight saved with its linked notes and questions.');return true;
}
function saveObservation(text) {
 if(!text.trim())return false;
 humanEntries.push({id:crypto.randomUUID(),kind:'observation',text:text.trim()});return true;
}
function exportEntry(entry) {
 const notes=entry.kind==='insight'?linkedEntries(entry):entry.kind==='note'?[entry]:[];
 return [entryLabel(entry)+': '+entry.text,...notes.map(note=>{if(note.kind==='question')return 'Question '+note.id+': '+note.text+'\nOrigin: '+note.origin.title+' | chapter '+(note.origin.itemId||'unassigned')+' | source '+(note.origin.sourceId||'none');const anchor=note.anchor;const source=sourceFor(anchor);return 'Note '+note.id+': '+note.text+'\n'+source.title+' | '+source.origin+' | '+anchor.version+' | paragraph '+(anchor.passage+1)+' | characters '+anchor.start+'–'+anchor.end+'\n> '+anchor.quote;})].join('\n\n');
}
function exportJson(value,name) {const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});downloadBlob(blob,name);}
function downloadBlob(blob,name) {const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportPlaybook() {
 const thesis='Start with an ideal motion model. Choose the controller using evidence from the environment where the robot will actually work.';
 const steps=['Compare three wheel-speed ratios.','Run the same turn on the intended floor.','Record the drift before changing the controller.'];
 const text=['# Learning robotics','Design prototype · illustrative content','## Notes and insights',...(humanEntries.length?humanEntries.map(exportEntry):[defaultInsight+' (example insight)']),'## Working thesis',thesis+' (example thesis; real-floor comparison remains open)','## Captured results',...(capturedResults.length?capturedResults.map(result=>[result.kind==='experiment'?'Illustrative experiment result':'Your observation · external result',result.text,result.url?'Result: '+result.url:''].filter(Boolean).join('\n')):['No results captured.']),'## Next steps',...steps.map((step,index)=>`- [${nextSteps.has(index)?'x':' '}] ${step}`),'## Source','Modern Robotics — Kevin M. Lynch and Frank C. Park, Chapter 13: Wheeled mobile robots','https://modernrobotics.northwestern.edu/nu-gm-book-resource/chapter-13-1-wheeled-mobile-robots/'].join('\n\n');
 downloadBlob(new Blob([text],{type:'text/markdown'}),'robotics-playbook.md');
}
function setTheme(next) {theme=next;document.documentElement.dataset.theme=theme;workspacePrototype.rerender();}
function renderFinder(query='') {const matched=screens.filter(screen=>screen.title.toLowerCase().includes(query.toLowerCase()));$('#finder-results').innerHTML=matched.length?matched.map(screen=>`<button class="finder-result" data-find-view="${screen.id}">${screen.title}<span>Open ${icon('arrow')}</span></button>`).join(''):'<p class="muted" style="padding:20px">No matching screen.</p>';}
function showFinder() {renderFinder();$('#finder-dialog').showModal();$('#finder-input').focus();}
const actions={
 theme:()=>setTheme(theme==='dark'?'light':'dark'),source:()=>$('#source-dialog').showModal(),finder:showFinder,
 'compose-note':showNoteComposer,'cancel-note':()=>{noteComposerOpen=false;noteDraft='';draftNoteAnchor=null;refreshReaderPanel();},
 'canvas-compose-insight':()=>{setView('reader');showInsightComposer();},
 'compose-insight':showInsightComposer,'cancel-insight':()=>{insightComposerOpen=false;refreshReaderPanel();},
 'insight-from-note':button=>{if(!draftSupportIds.includes(button.dataset.noteId))draftSupportIds.push(button.dataset.noteId);showInsightComposer();},
 'reader-sources':()=>{readerPanelOpen=true;readerPanelTab='sources';refreshReaderPanel();},'close-reader-panel':()=>{readerPanelOpen=false;refreshReaderPanel();},
 'choose-source-passage':()=>showSourcePassages(),
 'choose-notes':showNotesPicker,
 'inspect-anchor':inspectAnchor,
 'note-on-passage':button=>{if(!selectedAnchor||selectedAnchor.sourceId!==button.dataset.sourceId||selectedAnchor.passage!==Number(button.dataset.passage))selectedAnchor=passageAnchor(ideaSources.find(source=>source.id===button.dataset.sourceId),Number(button.dataset.passage));showNoteComposer();},
 'open-anchor-lesson':button=>{$('#idea-dialog').close();setView('reader',button.dataset.layer);$('#stage').focus();},

 'reader-deeper':()=>{setView('reader','deeper');},'reader-back':()=>{readerLayer='base';setView('reader');},
 explain:()=>{explanationVisible=true;explanationState='playing';refreshExplanation();},'collapse-explanation':()=>{explanationVisible=false;refreshExplanation();},'expand-explanation':()=>{explanationVisible=true;refreshExplanation();},
 'explanation-ready':()=>{explanationState='playing';refreshExplanation();},'explanation-retry':()=>{explanationState='loading';refreshExplanation();},'explanation-text':()=>{explanationState='text';refreshExplanation();},
 'follow-up':()=>{$('#follow-up-slot').innerHTML=`<form id="follow-up-form" class="follow-up"><input id="follow-up-question" aria-label="Follow-up question" placeholder="Ask a follow-up…" required><button class="outline" type="submit">Ask ${icon('arrow')}</button></form>`;$('#follow-up-question').focus();},
 'guide':()=>{guideActive=!guideActive;setView('practical');},'tool-mode':()=>{toolMode=toolMode==='embedded'?'external':'embedded';setView('practical');},
 'capture-result':()=>{capturedResults.push({kind:'experiment',text:`Right / left wheel speed: ${wheelRatio.toFixed(2)}×. Captured illustrative geometry; real-floor behavior remains untested.`});$('#result-receipts').innerHTML=renderResults();announce('Result captured and added to Playbook.');},
 'reset-experiment':()=>{wheelRatio=1;setView('practical');},'export-playbook':exportPlaybook,
 'component-save':()=>{$('#component-save-state').textContent='Saved · component feedback preview';},
 'zoom-in':()=>workspacePrototype.zoom(canvasZoom+.1),'zoom-out':()=>workspacePrototype.zoom(canvasZoom-.1),'canvas-fit':()=>workspacePrototype.fit(),
 'close-idea':()=>{$('#canvas-detail').hidden=true;},
};
function captureHighlight() {
 const selection=window.getSelection();
 if(!selection?.rangeCount||selection.isCollapsed)return null;
 const quote=selection.toString().trim();
 if(!quote)return null;
 const range=selection.getRangeAt(0);
 const node=range.commonAncestorContainer;
 const paragraph=(node.nodeType===Node.ELEMENT_NODE?node:node.parentElement)?.closest('p');
 if(!paragraph||paragraph.closest('#follow-up-slot')||!paragraph.textContent.includes(quote))return null;
 const source=paragraph.dataset.sourceId?ideaSources.find(item=>item.id===paragraph.dataset.sourceId):paragraph.closest('.article')?ideaSources.find(item=>item.layer===readerLayer):null;
 if(!source)return null;
 let passage=source.passages.findIndex(text=>text===paragraph.textContent);
 if(passage<0){passage=source.passages.length;source.passages.push(paragraph.textContent);}
 const start=source.passages[passage].indexOf(quote);
 return {...passageAnchor(source,passage),quote,start,end:start+quote.length};
}
function showHighlightTools() {
 const anchor=captureHighlight();
 const toolbar=$('#highlight-tools');
 if(!anchor){if(toolbar.matches(':popover-open'))toolbar.hidePopover();return;}
 selectedAnchor=anchor;
 const container=$('#idea-dialog').open?$('#idea-dialog'):document.body;
 if(toolbar.parentElement!==container){if(toolbar.matches(':popover-open'))toolbar.hidePopover();container.append(toolbar);}
 const rect=window.getSelection().getRangeAt(0).getBoundingClientRect();
 toolbar.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-100))+'px';
 toolbar.style.top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-48))+'px';
 if(!toolbar.matches(':popover-open'))toolbar.showPopover();
}
document.addEventListener('pointerup',event=>{if(!event.target.closest('button,input,textarea,select'))showHighlightTools();});
document.addEventListener('keyup',event=>{if(event.shiftKey||event.key==='Shift')showHighlightTools();});
document.addEventListener('scroll',()=>{if($('#highlight-tools').matches(':popover-open'))$('#highlight-tools').hidePopover();},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#highlight-tools').matches(':popover-open'))$('#highlight-tools').hidePopover();});
document.addEventListener('pointerdown',event=>{
 if(event.target.closest('[data-action="compose-note"],[data-action="note-on-passage"]')){
  const anchor=captureHighlight();if(anchor)selectedAnchor=anchor;
  if(event.target.closest('#highlight-tools'))event.preventDefault();
 }else if(!event.target.closest('#highlight-tools')){selectedAnchor=null;if($('#highlight-tools').matches(':popover-open'))$('#highlight-tools').hidePopover();}
});
document.addEventListener('keydown',event=>{
 const tab=event.target.closest('[data-reader-tab]');
 if(!tab||!['ArrowLeft','ArrowRight'].includes(event.key))return;
 event.preventDefault();const tabs=['notes','insights','sources'];readerPanelTab=tabs[(tabs.indexOf(readerPanelTab)+(event.key==='ArrowRight'?1:2))%3];refreshReaderPanel();$('#'+readerPanelTab+'-tab').focus();
});
document.addEventListener('click',event=>{
 const button=event.target.closest('button,[data-view]');if(!button)return;
 if(workspacePrototype.handleAction(button))return;
 if(button.dataset.learningItem){openLearningItem(button.dataset.learningItem);return;}
 if(button.dataset.readerTab){readerPanelTab=button.dataset.readerTab;refreshReaderPanel();$('#'+readerPanelTab+'-tab').focus();return;}
 if(button.dataset.view){if(button.dataset.tool)toolMode=button.dataset.tool;setView(button.dataset.view);return;}
 if(button.dataset.findView){$('#finder-dialog').close();setView(button.dataset.findView);return;}
 if(button.dataset.close){$('#'+button.dataset.close).close();return;}
 if(button.dataset.theme){setTheme(button.dataset.theme);return;}
 if(button.dataset.previewState){readerLayer='base';explanationState=button.dataset.previewState;explanationVisible=true;setView('reader');return;}
 if(button.dataset.entry){entryMode=button.dataset.entry;document.querySelectorAll('[data-entry]').forEach(option=>option.setAttribute('aria-pressed',String(option===button)));$('#opening-source').hidden=entryMode!=='source';$(entryMode==='source'?'#opening-url':'#learning-topic').focus();return;}
 actions[button.dataset.action]?.(button);
});
document.addEventListener('input',event=>{
 if(event.target.id==='source-url-input')event.target.setCustomValidity('');
 if(event.target.id==='learning-topic'){$('.learning-input').classList.toggle('has-text',Boolean(event.target.value));$('.opening-submit').disabled=!event.target.value.trim();event.target.style.height='auto';event.target.style.height=event.target.scrollHeight+'px';}
 if(event.target.id==='human-note'){noteDraft=event.target.value;$('#save-note').disabled=!draftNoteAnchor||!noteDraft.trim();}
 if(event.target.id==='human-insight'){insightDraft=event.target.value;$('#save-insight').disabled=draftSupportIds.length<2||!insightDraft.trim();}
 if(event.target.id==='visual-ratio'){visualRatio=Number(event.target.value);$('.visual-demo .robot-chart').outerHTML=visualSvg(visualRatio);}
 if(event.target.id==='wheel-ratio'){wheelRatio=Number(event.target.value);$('#wheel-output').textContent=wheelRatio.toFixed(2)+'×';$('#tool-scene').innerHTML=visualSvg(wheelRatio,'experiment-robot');}
 if(event.target.id==='finder-input')renderFinder(event.target.value);
});
document.addEventListener('change',event=>{if(event.target.dataset.linkNote){const id=event.target.dataset.linkNote;draftSupportIds=event.target.checked?[...new Set([...draftSupportIds,id])]:draftSupportIds.filter(noteId=>noteId!==id);$('#picker-status').textContent=`${draftSupportIds.length} entries linked`;refreshReaderPanel();}if(event.target.id==='idea-source'){showSourcePassages(event.target.value);$('#idea-source').focus();}if(event.target.dataset.next!==undefined){const key=Number(event.target.dataset.next);event.target.checked?nextSteps.add(key):nextSteps.delete(key);}});
document.addEventListener('submit',event=>{
 if(workspacePrototype.handleSubmit(event))return;
 if(event.target.id==='learning-form'){event.preventDefault();setView('reader');}
 if(event.target.id==='note-form'){event.preventDefault();if(!saveSourceNote($('#human-note').value))return;noteComposerOpen=false;noteDraft='';draftNoteAnchor=null;selectedAnchor=null;readerPanelOpen=true;refreshReaderPanel();$('.rail-record').focus({preventScroll:true});}
 if(event.target.id==='insight-form'){event.preventDefault();if(!saveInsight($('#human-insight').value))return;insightComposerOpen=false;insightDraft='';draftSupportIds=[];refreshReaderPanel();$('.rail-record').focus({preventScroll:true});}
 if(event.target.id==='observation-form'){event.preventDefault();if(!saveObservation($('#observation').value))return;$('#observation').value='';const message=document.createElement('p');message.className='saved-message';message.textContent='Observation saved in Canvas and Playbook.';event.target.append(message);}
 if(event.target.id==='result-form'){event.preventDefault();capturedResults.push({kind:'external',text:$('#result-note').value.trim(),url:$('#result-link').value});$('#result-receipts').innerHTML=renderResults();event.target.reset();announce('Returned result attached.');}
 if(event.target.id==='follow-up-form'){event.preventDefault();const question=$('#follow-up-question').value;followUp=`<div class="inline-answer"><div class="credit">Example follow-up · no live AI connected</div><p class="serif">${escapeHtml(question)}</p><p>The complete product answers here, beneath the original explanation, and retains this exchange with the passage.</p><button class="quiet" data-action="compose-note">Note ${icon('note')}</button></div>`;$('#follow-up-slot').innerHTML=followUp;}
});
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();showFinder();}});
$('#idea-dialog').addEventListener('close',()=>{if(view!=='reader')return;if(readerPanelTab==='notes'&&noteComposerOpen&&$('#human-note'))$('#human-note').focus({preventScroll:true});else if(readerPanelTab==='insights'&&$('.link-notes'))$('.link-notes').focus({preventScroll:true});});
renderSidebar();
$('#screen-select').innerHTML=screens.map(screen=>`<option value="${screen.id}">${screen.title}</option>`).join('');
$('#screen-select').onchange=event=>setView(event.target.value);
setView('opening');
