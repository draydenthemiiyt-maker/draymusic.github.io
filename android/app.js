// Elements (guarded)
const audio = document.getElementById('audioElement');
const songListContainer = document.getElementById('songList');
const searchInput = document.getElementById('searchInput');
const seekBar = document.getElementById('seekBar');
const progressFill = document.getElementById('progressFill');
const progressWrapper = document.querySelector('.progress-wrapper');

let allSongs = [];
let currentPlaylist = [];
let currentIndex = -1;
let isLooping = false;

/* -------------------------
   Smooth scrubbing helpers
   ------------------------- */
let pendingSeekPercent = null;

function clampPercent(p) {
  const n = Number(p);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function updateSeekUI(percent) {
  const p = clampPercent(percent);
  if (seekBar) seekBar.value = p;
  if (progressFill) progressFill.style.width = p + '%';
}

function applySeekToAudio(percent) {
  if (!audio) return;
  const p = clampPercent(percent);

  if (!audio.duration || isNaN(audio.duration) || audio.duration === Infinity) {
    // Can't set time yet; remember desired percent
    pendingSeekPercent = p;
    return;
  }

  const time = (p / 100) * audio.duration;

  // Prefer fastSeek if available
  if (typeof audio.fastSeek === 'function') {
    try {
      audio.fastSeek(time);
    } catch (e) {
      audio.currentTime = time;
    }
  } else {
    audio.currentTime = time;
  }

  pendingSeekPercent = null;
}

/* Ensure range attributes */
if (seekBar) {
  seekBar.min = seekBar.min || 0;
  seekBar.max = seekBar.max || 100;
  seekBar.step = seekBar.step || 0.1;
}

/* --- Event listeners for smooth scrubbing --- */
if (seekBar && progressWrapper) {
  // Start/stop seeking visual state
  function startSeeking() { progressWrapper.classList.add('seeking'); }
  function stopSeeking() { progressWrapper.classList.remove('seeking'); }

  // Immediate UI feedback while dragging
  seekBar.addEventListener('input', function (e) {
    const val = e.target.value;
    updateSeekUI(val);
    applySeekToAudio(val); // attempt to apply; may be stored as pending
  }, { passive: true });

  // Finalize on change (some browsers fire change at end)
  seekBar.addEventListener('change', function (e) {
    applySeekToAudio(e.target.value);
  });

  // Pointer events for smooth cross-device dragging
  seekBar.addEventListener('pointerdown', startSeeking);
  seekBar.addEventListener('pointerup', stopSeeking);
  seekBar.addEventListener('pointercancel', stopSeeking);

  // Fallbacks for older browsers / touch
  seekBar.addEventListener('touchstart', startSeeking, { passive: true });
  seekBar.addEventListener('mousedown', startSeeking);
  window.addEventListener('touchend', stopSeeking);
  window.addEventListener('mouseup', stopSeeking);
}

/* Apply pending seek once metadata is available and keep UI in sync */
if (audio) {
  audio.addEventListener('loadedmetadata', function () {
    if (pendingSeekPercent !== null) {
      applySeekToAudio(pendingSeekPercent);
    }
    // Sync UI to actual position
    if (audio.duration && !isNaN(audio.duration)) {
      const pct = (audio.currentTime / audio.duration) * 100;
      updateSeekUI(pct);
    }
  });

  // Only update UI from timeupdate when not actively seeking
  audio.addEventListener('timeupdate', function () {
    if (!progressWrapper || progressWrapper.classList.contains('seeking')) return;
    if (!audio.duration || isNaN(audio.duration)) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    updateSeekUI(pct);
  });
}

/* --- Load music XML and parse safely --- */
async function loadMusic() {
  try {
    const response = await fetch('https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml?nocache=' + Date.now());
    const text = await response.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const items = xml.getElementsByTagName('song') || [];

    allSongs = Array.from(items).map(s => {
      const getText = (tag) => {
        const el = s.getElementsByTagName(tag)[0];
        return el && el.textContent ? el.textContent : '';
      };

      return {
        title: getText('title') || 'Unknown Title',
        artist: getText('artist') || 'Unknown Artist',
        url: getText('url') || '',
        art: getText('albumArt') || 'placeholder.png'
      };
    });

    // Fisher–Yates shuffle
    for (let i = allSongs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allSongs[i], allSongs[j]] = [allSongs[j], allSongs[i]];
    }

    currentPlaylist = allSongs.slice();
    renderList(currentPlaylist);
  } catch (e) {
    console.error('Failed to load music:', e);
  }
}

/* --- Render list safely --- */
function renderList(data) {
  if (!songListContainer) return;

  const esc = (str) => String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  songListContainer.innerHTML = data.map((song, index) => {
    return `
      <div class="song-card" data-index="${index}" style="animation-delay: ${index * 0.05}s">
        <img src="${esc(song.art)}" alt="${esc(song.title)} album art">
        <div class="info">
          <h4>${esc(song.title)}</h4>
          <p>${esc(song.artist)}</p>
        </div>
      </div>
    `;
  }).join('');

  // Attach click handlers (avoid inline onclick)
  const cards = songListContainer.querySelectorAll('.song-card');
  cards.forEach(card => {
    card.addEventListener('click', function () {
      const idx = Number(this.getAttribute('data-index'));
      playSong(idx);
    });
  });
}

/* --- Playback functions --- */
function playSong(index) {
  if (!audio || currentPlaylist.length === 0) return;

  currentIndex = (index + currentPlaylist.length) % currentPlaylist.length;
  const song = currentPlaylist[currentIndex];
  if (!song || !song.url) return;

  audio.src = song.url;
  audio.play().catch(err => {
    // autoplay may be blocked; handle gracefully
    console.error('Playback failed:', err);
  });

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        artwork: [{ src: song.art, sizes: '512x512', type: 'image/png' }]
      });
    } catch (e) {
      // some browsers may throw if artwork is invalid
      console.error('mediaSession metadata error', e);
    }
  }

  const titleEl = document.getElementById('currentTitle');
  const artistEl = document.getElementById('currentArtist');
  const artEl = document.getElementById('currentArt');
  const playBtn = document.getElementById('btnPlayPause');

  if (titleEl) titleEl.innerText = song.title;
  if (artistEl) artistEl.innerText = song.artist;
  if (artEl) artEl.src = song.art;
  if (playBtn) playBtn.innerHTML = '<span class="material-symbols-rounded">pause</span>';
}

function playNext() { playSong(currentIndex + 1); }
function playPrev() { playSong(currentIndex - 1); }

/* --- Controls --- */
const btnPlayPause = document.getElementById('btnPlayPause');
if (btnPlayPause && audio) {
  btnPlayPause.onclick = () => {
    if (audio.paused) {
      audio.play().catch(() => {});
      btnPlayPause.innerHTML = '<span class="material-symbols-rounded">pause</span>';
    } else {
      audio.pause();
      btnPlayPause.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
    }
  };
}

const btnNext = document.getElementById('btnNext');
const btnPrev = document.getElementById('btnPrev');
if (btnNext) btnNext.onclick = () => playSong(currentIndex + 1);
if (btnPrev) btnPrev.onclick = () => playSong(currentIndex - 1);

const btnLoop = document.getElementById('btnLoop');
if (btnLoop) {
  btnLoop.onclick = () => {
    isLooping = !isLooping;
    btnLoop.classList.toggle('active', isLooping);
  };
}

/* --- Ended behavior --- */
if (audio) {
  audio.onended = () => {
    if (isLooping) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      playSong(currentIndex + 1);
    }
  };
}

/* --- Search --- */
if (searchInput) {
  searchInput.oninput = () => {
    const q = (searchInput.value || '').toLowerCase();
    currentPlaylist = allSongs.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q)
    );
    renderList(currentPlaylist);
  };
}

/* --- Start --- */
loadMusic();
