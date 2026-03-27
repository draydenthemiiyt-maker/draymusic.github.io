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

/* --- Event listeners with guards --- */
if (seekBar && progressWrapper) {
  seekBar.addEventListener('touchstart', () => progressWrapper.classList.add('seeking'));
  seekBar.addEventListener('mousedown', () => progressWrapper.classList.add('seeking'));

  window.addEventListener('touchend', () => {
    progressWrapper.classList.remove('seeking');
  });
  window.addEventListener('mouseup', () => {
    progressWrapper.classList.remove('seeking');
  });

  // Fixed syntax here and ensured numeric usage
  seekBar.oninput = () => {
    if (!audio || !audio.duration) return;

    // ensure value is numeric (range input may give string)
    const value = Number(seekBar.value) || 0;
    const seekTo = (value / 100) * audio.duration;
    audio.currentTime = seekTo;

    const pct = value + "%";
    if (progressFill) progressFill.style.width = pct;
  };
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

  songListContainer.innerHTML = data.map((song, index) => {
    // Escape values minimally to avoid breaking HTML (simple replace)
    const esc = (str) => String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
    console.warn('Playback failed:', err);
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
      console.warn('mediaSession metadata error', e);
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

/* --- Time update --- */
if (audio && progressWrapper && progressFill && seekBar) {
  audio.ontimeupdate = () => {
    if (audio.duration && !progressWrapper.classList.contains('seeking')) {
      const pct = (audio.currentTime / audio.duration) * 100;
      seekBar.value = pct;
      progressFill.style.width = pct + "%";
    }
  };
}

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
