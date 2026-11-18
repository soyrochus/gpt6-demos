'use strict';

const demos = JSON.parse(document.querySelector('#demo-data').textContent);
const dialog = document.querySelector('#preview-dialog');
const video = document.querySelector('#video');
const closeButton = dialog.querySelector('.close-button');
let opener;
let playbackTimer;

function stopVideo() {
  window.clearTimeout(playbackTimer);
  video.replaceChildren();
}

function playVideo(demo) {
  stopVideo();
  const status = document.createElement('span');
  status.className = 'video-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading YouTube…';
  const frame = document.createElement('iframe');
  const url = new URL(`https://www.youtube-nocookie.com/embed/${demo.video}`);
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('rel', '0');
  if (location.protocol !== 'file:') url.searchParams.set('origin', location.origin);
  frame.src = url.href;
  frame.title = `${demo.name} — YouTube walkthrough`;
  frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.addEventListener('load', () => { window.clearTimeout(playbackTimer); status.remove(); });
  frame.addEventListener('error', () => { status.textContent = 'Unable to load. Try the “Watch on YouTube” link below.'; });
  video.append(frame, status);
  frame.focus();
  playbackTimer = window.setTimeout(() => {
    status.textContent = 'Taking a while? Try the “Watch on YouTube” link below.';
  }, 12000);
}

function showPreviewMedia(demo) {
  const youtubeLink = document.querySelector('#youtube-link');
  youtubeLink.hidden = !demo.video;
  if (!demo.video) {
    youtubeLink.removeAttribute('href');
    const screenshot = document.createElement('img');
    screenshot.src = demo.image;
    screenshot.alt = demo.imageAlt;
    video.append(screenshot);
    return;
  }
  youtubeLink.href = `https://www.youtube.com/watch?v=${demo.video}`;
  const poster = document.createElement('button');
  poster.type = 'button';
  poster.className = 'video-poster';
  poster.setAttribute('aria-label', `Play ${demo.name} walkthrough on YouTube`);
  const thumbnail = document.createElement('img');
  thumbnail.src = demo.poster || `https://i.ytimg.com/vi/${demo.video}/maxresdefault.jpg`;
  thumbnail.alt = '';
  thumbnail.addEventListener('load', () => {
    // YouTube can return a tiny placeholder when a high-resolution poster is unavailable.
    if (thumbnail.naturalWidth < 640) thumbnail.src = demo.image;
  }, { once: true });
  thumbnail.addEventListener('error', () => { thumbnail.src = demo.image; }, { once: true });
  const label = document.createElement('span');
  label.className = 'play-label';
  label.innerHTML = '<span class="play-disc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7V5Z" fill="currentColor"/></svg></span><span>Play walkthrough · YouTube</span>';
  poster.append(thumbnail, label);
  poster.addEventListener('click', () => playVideo(demo), { once: true });
  video.append(poster);
}

function openPreview(index, trigger) {
  const demo = demos[index];
  opener = trigger;
  stopVideo();
  document.querySelector('#dialog-category').textContent = demo.category;
  const title = document.querySelector('#demo-title-link');
  title.querySelector('span').textContent = demo.name;
  title.href = demo.url;
  title.setAttribute('aria-label', `${demo.name} (opens in a new tab)`);
  const launch = document.querySelector('#demo-link');
  launch.href = demo.url;
  document.querySelector('#demo-link-label').textContent = demo.launchLabel || 'Open demo';
  launch.setAttribute('aria-label', `${demo.launchLabel || 'Open'} ${demo.name} (opens in a new tab)`);
  const description = document.querySelector('#dialog-description');
  description.replaceChildren(...demo.description.split('\n\n').map(text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
  }));
  showPreviewMedia(demo);
  const fileMode = location.protocol === 'file:';
  const basePort = location.port || (location.protocol === 'https:' ? '443' : '80');
  const launchCommand = fileMode ? './run-all.sh' : `./run-all.sh ${basePort}`;
  let note = demo.note || `Start the browser demos with ${launchCommand} before opening.`;
  if (fileMode && demo.video) {
    note += ' Serve the portal over HTTP for embedded video, or use Watch on YouTube.';
  }
  document.querySelector('#dialog-note').textContent = note;
  dialog.showModal();
  dialog.scrollTop = 0;
  closeButton.focus({ preventScroll: true });
}

document.querySelectorAll('[data-demo]').forEach(button => {
  button.addEventListener('click', () => openPreview(Number(button.dataset.demo), button));
});
closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  stopVideo();
  opener?.focus({ preventScroll: true });
});
// Require both ends of the click outside the dialog, so dragging from the player cannot dismiss it.
let pointerStartedOutside = false;
function outside(event) {
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}
dialog.addEventListener('pointerdown', event => { pointerStartedOutside = event.target === dialog && outside(event); });
dialog.addEventListener('click', event => {
  if (pointerStartedOutside && event.target === dialog && outside(event)) dialog.close();
  pointerStartedOutside = false;
});
