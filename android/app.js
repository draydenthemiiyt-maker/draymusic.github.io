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
        pendingSeekPercent = p;
        return;
    }

    const time = (p / 100) * audio.duration;

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

if (seekBar) {
    seekBar.min = seekBar.min || 0;
    seekBar.max = seekBar.max || 100;
    seekBar.step = seekBar.step || 0.1;
}

if (seekBar && progressWrapper) {
    function startSeeking() { progressWrapper.classList.add('seeking'); }
    function stopSeeking() { progressWrapper.classList.remove('seeking'); }

    seekBar.addEventListener('input', function (e) {
        const val = e.target.value;
        updateSeekUI(val);
        applySeekToAudio(val);
    }, { passive: true });

    seekBar.addEventListener('change', function (e) {
        applySeekToAudio(e.target.value);
    });

    seekBar.addEventListener('pointerdown', startSeeking);
    seekBar.addEventListener('pointerup', stopSeeking);
    seekBar.addEventListener('pointercancel', stopSeeking);

    seekBar.addEventListener('touchstart', startSeeking, { passive: true });
    seekBar.addEventListener('mousedown', startSeeking);
    window.addEventListener('touchend', stopSeeking);
    window.addEventListener('mouseup', stopSeeking);
}

if (audio) {
    audio.addEventListener('loadedmetadata', function () {
        if (pendingSeekPercent !== null) {
            applySeekToAudio(pendingSeekPercent);
        }
        if (audio.duration && !isNaN(audio.duration)) {
            const pct = (audio.currentTime / audio.duration) * 100;
            updateSeekUI(pct);
        }
    });

    audio.addEventListener('timeupdate', function () {
        if (!progressWrapper || progressWrapper.classList.contains('seeking')) return;
        if (!audio.duration || isNaN(audio.duration)) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        updateSeekUI(pct);
    });
}

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

        for (let i = allSongs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allSongs[i], allSongs[j]] = [allSongs[j], allSongs[i]];
        }

        currentPlaylist = allSongs.slice();
        renderList(currentPlaylist);
    } catch (e) {
        console.warn('Failed to load music:', e);
    }
}

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

    const cards = songListContainer.querySelectorAll('.song-card');
    cards.forEach(card => {
        card.addEventListener('click', function () {
            const idx = Number(this.getAttribute('data-index'));
            playSong(idx);
        });
    });
}

function playSong(index) {
    if (!audio || currentPlaylist.length === 0) return;

    currentIndex = (index + currentPlaylist.length) % currentPlaylist.length;
    const song = currentPlaylist[currentIndex];
    if (!song || !song.url) return;

    audio.src = song.url;
    audio.play().catch(err => {
        console.warn('Playback failed:', err);
    });

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

const btnPlayPause = document.getElementById('btnPlayPause');
if (btnPlayPause && audio) {
    btnPlayPause.onclick = () => {
        if (audio.paused) {
            audio.play().catch(() => { });
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

if (audio) {
    audio.onended = () => {
        if (isLooping) {
            audio.currentTime = 0;
            audio.play().catch(() => { });
        } else {
            playSong(currentIndex + 1);
        }
    };
}

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

/* ===== Windows UWP integration: accent + SMTC ===== */

(function initWindowsIntegration() {
    // Feature-detect Windows Runtime (WinRT) objects exposed to the page
    const hasWinRT = typeof window.Windows !== 'undefined';
    if (!hasWinRT) {
        console.info('Windows Runtime not available — skipping UWP integration.');
        return;
    }

    // Shortcuts to WinRT namespaces (guarded)
    const Win = window.Windows || {};
    const ViewMgmt = Win.UI && Win.UI.ViewManagement ? Win.UI.ViewManagement : null;
    const Media = Win.Media || null;
    const Storage = Win.Storage || null;
    const Foundation = Win.Foundation || null;
    if (!ViewMgmt || !Media || !Storage || !Foundation) {
        console.info('Some Windows APIs missing — partial or no UWP integration.');
    }

    /* ---------- Accent color integration ---------- */
    try {
        if (ViewMgmt && ViewMgmt.UISettings) {
            const uiSettings = new ViewMgmt.UISettings();

            // Convert WinRT Color to CSS hex string
            function winColorToHex(winColor) {
                if (!winColor) return '#0078D7'; // fallback accent
                const r = winColor.r || 0;
                const g = winColor.g || 0;
                const b = winColor.b || 0;
                // ignore alpha for CSS accent variable; if you want alpha, include it
                return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
            }

            function applyAccentFromUISettings() {
                try {
                    const winColor = uiSettings.getColorValue(ViewMgmt.UIColorType.accent);
                    const hex = winColorToHex(winColor);
                    document.documentElement.style.setProperty('--accent', hex);
                    // optional: set a CSS meta class for Windows host
                    document.documentElement.classList.add('windows-uwp-accent');
                    console.info('Applied Windows accent color:', hex);
                } catch (e) {
                    console.warn('Failed to read Windows accent color:', e);
                }
            }

            // initial apply
            applyAccentFromUISettings();

            // listen for accent changes
            try {
                uiSettings.addEventListener('colorvalueschanged', function () {
                    // event may be raised on a non-UI thread; schedule on main thread
                    setTimeout(applyAccentFromUISettings, 0);
                });
            } catch (e) {
                // older hosts may use oncolorvalueschanged or different wiring; ignore silently
                console.info('Could not attach color change listener:', e);
            }
        }
    } catch (e) {
        console.warn('Accent integration failed:', e);
    }

    /* ---------- System Media Transport Controls (SMTC) integration ---------- */
    try {
        if (Media && Media.SystemMediaTransportControls) {
            const smtc = Media.SystemMediaTransportControls.getForCurrentView();

            // Enable the buttons we want
            try {
                smtc.isEnabled = true;
                smtc.isPlayEnabled = true;
                smtc.isPauseEnabled = true;
                smtc.isNextEnabled = true;
                smtc.isPreviousEnabled = true;
                // fast forward / rewind may be available depending on host
                smtc.isFastForwardEnabled = true;
                smtc.isRewindEnabled = true;
            } catch (e) {
                // some properties may be read-only in certain hosts; ignore
            }

            // Helper to update SMTC playback status
            function updateSmtcPlaybackStatus() {
                try {
                    const status = audio && !audio.paused ? Media.MediaPlaybackStatus.playing : Media.MediaPlaybackStatus.paused;
                    smtc.playbackStatus = status;
                } catch (e) {
                    // fallback: try setPlaybackStatus if property not writable
                    try { smtc.setPlaybackStatus && smtc.setPlaybackStatus(audio && !audio.paused ? Media.MediaPlaybackStatus.playing : Media.MediaPlaybackStatus.paused); } catch (err) { }
                }
            }

            // Helper to update SMTC display metadata (title, artist, album art)
            function updateSmtcMetadata() {
                try {
                    const updater = smtc.displayUpdater;
                    updater.type = Media.MediaPlaybackType.music;

                    const song = currentPlaylist && currentPlaylist[currentIndex];
                    if (song) {
                        // set music properties
                        updater.musicProperties.title = song.title || '';
                        updater.musicProperties.artist = song.artist || '';
                        // albumArtist is optional
                        updater.musicProperties.albumArtist = song.artist || '';

                        // set thumbnail if available
                        if (song.art) {
                            try {
                                // create a URI and stream reference for the thumbnail
                                const uri = new Foundation.Uri(song.art);
                                const ras = Storage.Streams.RandomAccessStreamReference.createFromUri(uri);
                                updater.thumbnail = ras;
                            } catch (e) {
                                // if creating a Uri fails (e.g., relative path), skip thumbnail
                                updater.thumbnail = null;
                            }
                        } else {
                            // clear metadata if no song
                            updater.musicProperties.title = '';
                            updater.musicProperties.artist = '';
                            updater.thumbnail = null;
                        }

                        // commit the update
                        updater.update();
                    } catch (e) {
                        console.warn('Failed to update SMTC metadata:', e);
                    }
                }

      // Respond to SMTC button presses
      try {
                    smtc.addEventListener('buttonpressed', function (ev) {
                        try {
                            const btn = ev.button;
                            switch (btn) {
                                case Media.SystemMediaTransportControlsButton.play:
                                    audio && audio.play().catch(() => { });
                                    break;
                                case Media.SystemMediaTransportControlsButton.pause:
                                    audio && audio.pause();
                                    break;
                                case Media.SystemMediaTransportControlsButton.next:
                                    // play next track
                                    if (typeof playNext === 'function') playNext();
                                    else playSong(currentIndex + 1);
                                    break;
                                case Media.SystemMediaTransportControlsButton.previous:
                                    if (typeof playPrev === 'function') playPrev();
                                    else playSong(currentIndex - 1);
                                    break;
                                case Media.SystemMediaTransportControlsButton.fastForward:
                                    // attempt a small seek forward
                                    if (audio && audio.duration && !isNaN(audio.duration)) {
                                        audio.currentTime = Math.min(audio.duration, (audio.currentTime || 0) + 10);
                                    }
                                    break;
                                case Media.SystemMediaTransportControlsButton.rewind:
                                    if (audio) {
                                        audio.currentTime = Math.max(0, (audio.currentTime || 0) - 10);
                                    }
                                    break;
                                default:
                                    break;
                            }
                            // reflect new playback status
                            updateSmtcPlaybackStatus();
                        } catch (e) {
                            console.warn('Error handling SMTC button press:', e);
                        }
                    });
                } catch (e) {
                    console.info('SMTC button event wiring failed:', e);
                }

                // Keep SMTC metadata & status in sync with audio element
                if (audio) {
                    // when a new song is played, update metadata
                    const origPlaySong = window.playSong;
                    // If playSong is defined, wrap it to update SMTC metadata after switching
                    if (typeof origPlaySong === 'function') {
                        window.playSong = function (index) {
                            const ret = origPlaySong(index);
                            // small timeout to allow audio.src to be set and metadata to load
                            setTimeout(() => {
                                updateSmtcMetadata();
                                updateSmtcPlaybackStatus();
                                // update timeline properties if available
                                try {
                                    if (smtc.timelineProperties) {
                                        smtc.timelineProperties.startTime = 0;
                                        smtc.timelineProperties.endTime = audio && audio.duration ? audio.duration : 0;
                                        smtc.timelineProperties.position = audio ? audio.currentTime : 0;
                                        // some hosts require setTimelineProperties
                                        if (typeof smtc.setTimelineProperties === 'function') {
                                            smtc.setTimelineProperties(smtc.timelineProperties);
                                        }
                                    }
                                } catch (e) { }
                            }, 200);
                            return ret;
                        };
                    }

                    // update playback status on play/pause/timeupdate
                    audio.addEventListener('play', updateSmtcPlaybackStatus);
                    audio.addEventListener('pause', updateSmtcPlaybackStatus);
                    audio.addEventListener('timeupdate', function () {
                        // update timeline position if supported
                        try {
                            if (smtc.timelineProperties) {
                                smtc.timelineProperties.position = audio.currentTime || 0;
                                if (typeof smtc.setTimelineProperties === 'function') {
                                    smtc.setTimelineProperties(smtc.timelineProperties);
                                }
                            }
                        } catch (e) { }
                    });

                    // update metadata when metadata loads (duration/title/thumbnail)
                    audio.addEventListener('loadedmetadata', function () {
                        updateSmtcMetadata();
                        updateSmtcPlaybackStatus();
                    });
                }

                // initial metadata push
                updateSmtcMetadata();
                updateSmtcPlaybackStatus();
            } else {
                console.info('SystemMediaTransportControls not available in this host.');
            }
        } catch (e) {
            console.warn('SMTC integration failed:', e);
        }

        /* ---------- End of UWP integration ---------- */
    }) ();

loadMusic();
