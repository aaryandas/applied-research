'use strict';
const toggle=document.getElementById('toggle-ui');
const overlay=document.getElementById('opening-interface');
toggle.addEventListener('click',()=>{overlay.hidden=!overlay.hidden;toggle.setAttribute('aria-pressed',String(!overlay.hidden));toggle.textContent=overlay.hidden?'Interface hidden':'Interface visible';});
document.querySelectorAll('[data-entry]').forEach(button=>button.addEventListener('click',()=>document.getElementById('preview-notice').showModal()));

const screen=document.querySelector('.opening-screen');
const canvas=document.querySelector('.desktop-canvas');
const fit=()=>{canvas.style.transform=`scale(${screen.clientWidth/1440})`;};
new ResizeObserver(fit).observe(screen);
fit();
