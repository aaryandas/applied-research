/* global window, document */
const video = document.querySelector('video');
const stages = document.querySelector('nav');
// Synthetic test hook in an isolated harness; this is not an application transport seam.
window.loadExplanation = (source, artifact) => {
  video.pause();
  video.src = source;
  stages.replaceChildren();
  for (const stage of artifact.stages) {
    const button = document.createElement('button');
    button.textContent = stage.name;
    button.addEventListener('click', () => {
      video.pause();
      video.currentTime = stage.seconds;
    });
    stages.append(button);
  }
  document.querySelector('#identity').textContent =
    `${artifact.recipe.recipe} v${artifact.recipe.version} · ${artifact.recipeHash} · origin: synthetic / unbound`;
};
for (const event of [
  'loadedmetadata',
  'play',
  'pause',
  'seeked',
  'ended',
  'error',
])
  video.addEventListener(event, () => {
    document.querySelector('#state').textContent =
      `${event} · ${video.currentTime.toFixed(2)} / ${Number.isFinite(video.duration) ? video.duration.toFixed(2) : 'pending'} seconds`;
  });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) video.pause();
});
window.addEventListener('pagehide', () => {
  video.pause();
  video.removeAttribute('src');
  video.load();
});
