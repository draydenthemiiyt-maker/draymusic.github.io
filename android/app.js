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

/* ===== Windows UWP integration (ES5-safe) with Live Tile ===== */
(function initWindowsIntegrationWithTile() {
    if (typeof window.Windows === 'undefined') {
        try { console.info('Windows Runtime not available — skipping UWP integration.'); } catch (e) { }
        return;
    }

    var Win = window.Windows || {};
    var ViewMgmt = (Win.UI && Win.UI.ViewManagement) ? Win.UI.ViewManagement : null;
    var Media = Win.Media || null;
    var Storage = Win.Storage || null;
    var Foundation = Win.Foundation || null;

    /* ---------- Accent color integration ---------- */
    try {
        if (ViewMgmt && ViewMgmt.UISettings) {
            var uiSettings = new ViewMgmt.UISettings();

            function toHexByte(n) {
                var s = (n || 0).toString(16);
                return s.length === 1 ? '0' + s : s;
            }

            function winColorToHex(winColor) {
                if (!winColor) return '#0078D7';
                var r = winColor.r || 0;
                var g = winColor.g || 0;
                var b = winColor.b || 0;
                return '#' + toHexByte(r) + toHexByte(g) + toHexByte(b);
            }

            function applyAccentFromUISettings() {
                try {
                    var winColor = uiSettings.getColorValue(ViewMgmt.UIColorType.accent);
                    var hex = winColorToHex(winColor);
                    try {
                        document.documentElement.style.setProperty('--accent', hex);
                        document.documentElement.classList.add('windows-uwp-accent');
                    } catch (e) { }
                    try { console.info('Applied Windows accent color:', hex); } catch (e) { }
                } catch (e) {
                    try { console.warn('Failed to read Windows accent color:', e); } catch (err) { }
                }
            }

            applyAccentFromUISettings();

            try {
                uiSettings.addEventListener('colorvalueschanged', function () {
                    setTimeout(applyAccentFromUISettings, 0);
                });
            } catch (e) {
                try { console.info('Could not attach color change listener:', e); } catch (err) { }
            }
        }
    } catch (e) {
        try { console.warn('Accent integration failed:', e); } catch (err) { }
    }

    /* ---------- System Media Transport Controls (SMTC) integration ---------- */
    try {
        if (Media && Media.SystemMediaTransportControls) {
            var smtc = Media.SystemMediaTransportControls.getForCurrentView();

            try {
                smtc.isEnabled = true;
                smtc.isPlayEnabled = true;
                smtc.isPauseEnabled = true;
                smtc.isNextEnabled = true;
                smtc.isPreviousEnabled = true;
                smtc.isFastForwardEnabled = true;
                smtc.isRewindEnabled = true;
            } catch (e) { }

            function updateSmtcPlaybackStatus() {
                try {
                    var status = (audio && !audio.paused) ? Media.MediaPlaybackStatus.playing : Media.MediaPlaybackStatus.paused;
                    try {
                        smtc.playbackStatus = status;
                    } catch (err) {
                        try { smtc.setPlaybackStatus && smtc.setPlaybackStatus(status); } catch (e) { }
                    }
                } catch (e) { }
            }

            function updateSmtcMetadata() {
                try {
                    var updater = smtc.displayUpdater;
                    updater.type = Media.MediaPlaybackType.music;

                    var song = (currentPlaylist && typeof currentPlaylist[currentIndex] !== 'undefined') ? currentPlaylist[currentIndex] : null;
                    if (song) {
                        try { updater.musicProperties.title = song.title || ''; } catch (e) { }
                        try { updater.musicProperties.artist = song.artist || ''; } catch (e) { }
                        try { updater.musicProperties.albumArtist = song.artist || ''; } catch (e) { }

                        if (song.art) {
                            try {
                                var uri = new Foundation.Uri(song.art);
                                var ras = Storage.Streams.RandomAccessStreamReference.createFromUri(uri);
                                updater.thumbnail = ras;
                            } catch (e) {
                                try { updater.thumbnail = null; } catch (err) { }
                            }
                        } else {
                            try { updater.thumbnail = null; } catch (e) { }
                        }
                    } else {
                        try { updater.musicProperties.title = ''; } catch (e) { }
                        try { updater.musicProperties.artist = ''; } catch (e) { }
                        try { updater.thumbnail = null; } catch (e) { }
                    }

                    try { updater.update(); } catch (e) { }
                } catch (e) {
                    try { console.warn('Failed to update SMTC metadata:', e); } catch (err) { }
                }
            }

            try {
                smtc.addEventListener('buttonpressed', function (ev) {
                    try {
                        var btn = ev.button;
                        switch (btn) {
                            case Media.SystemMediaTransportControlsButton.play:
                                if (audio && audio.play) { try { audio.play().catch(function () { }); } catch (e) { try { audio.play(); } catch (err) { } } }
                                break;
                            case Media.SystemMediaTransportControlsButton.pause:
                                if (audio && audio.pause) { try { audio.pause(); } catch (e) { } }
                                break;
                            case Media.SystemMediaTransportControlsButton.next:
                                if (typeof playNext === 'function') { try { playNext(); } catch (e) { } } else { try { playSong(currentIndex + 1); } catch (e) { } }
                                break;
                            case Media.SystemMediaTransportControlsButton.previous:
                                if (typeof playPrev === 'function') { try { playPrev(); } catch (e) { } } else { try { playSong(currentIndex - 1); } catch (e) { } }
                                break;
                            case Media.SystemMediaTransportControlsButton.fastForward:
                                if (audio && audio.duration && !isNaN(audio.duration)) {
                                    try { audio.currentTime = Math.min(audio.duration, (audio.currentTime || 0) + 10); } catch (e) { }
                                }
                                break;
                            case Media.SystemMediaTransportControlsButton.rewind:
                                if (audio) {
                                    try { audio.currentTime = Math.max(0, (audio.currentTime || 0) - 10); } catch (e) { }
                                }
                                break;
                            default:
                                break;
                        }
                        updateSmtcPlaybackStatus();
                    } catch (e) {
                        try { console.warn('Error handling SMTC button press:', e); } catch (err) { }
                    }
                });
            } catch (e) {
                try { console.info('SMTC button event wiring failed:', e); } catch (err) { }
            }

            if (audio) {
                var origPlaySong = window.playSong;
                if (typeof origPlaySong === 'function') {
                    window.playSong = function (index) {
                        var ret;
                        try { ret = origPlaySong(index); } catch (e) { }
                        setTimeout(function () {
                            try { updateSmtcMetadata(); } catch (e) { }
                            try { updateSmtcPlaybackStatus(); } catch (e) { }
                            try {
                                if (smtc.timelineProperties) {
                                    smtc.timelineProperties.startTime = 0;
                                    smtc.timelineProperties.endTime = (audio && audio.duration) ? audio.duration : 0;
                                    smtc.timelineProperties.position = audio ? audio.currentTime : 0;
                                    if (typeof smtc.setTimelineProperties === 'function') {
                                        try { smtc.setTimelineProperties(smtc.timelineProperties); } catch (e) { }
                                    }
                                }
                            } catch (e) { }
                        }, 200);
                        return ret;
                    };
                }

                try { audio.addEventListener('play', updateSmtcPlaybackStatus); } catch (e) { }
                try { audio.addEventListener('pause', updateSmtcPlaybackStatus); } catch (e) { }
                try {
                    audio.addEventListener('timeupdate', function () {
                        try {
                            if (smtc.timelineProperties) {
                                smtc.timelineProperties.position = audio.currentTime || 0;
                                if (typeof smtc.setTimelineProperties === 'function') {
                                    try { smtc.setTimelineProperties(smtc.timelineProperties); } catch (e) { }
                                }
                            }
                        } catch (e) { }
                    });
                } catch (e) { }

                try {
                    audio.addEventListener('loadedmetadata', function () {
                        try { updateSmtcMetadata(); } catch (e) { }
                        try { updateSmtcPlaybackStatus(); } catch (e) { }
                    });
                } catch (e) { }
            }

            try { updateSmtcMetadata(); } catch (e) { }
            try { updateSmtcPlaybackStatus(); } catch (e) { }
        } else {
            try { console.info('SystemMediaTransportControls not available in this host.'); } catch (e) { }
        }
    } catch (e) {
        try { console.warn('SMTC integration failed:', e); } catch (err) { }
    }

    /* ---------- Live Tile integration (ES5-safe) ---------- */

    // Helper: convert image URL to blob URL if necessary
    function fetchToBlobUrl(url, cb) {
        try {
            if (!url) { cb(null); return; }
            if (/^https?:\/\//i.test(url) || /^ms-appx:\/\//i.test(url)) { cb(url); return; }
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.responseType = 'blob';
                xhr.onload = function () {
                    try {
                        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
                            cb(URL.createObjectURL(xhr.response));
                        } else {
                            cb(null);
                        }
                    } catch (e) { cb(null); }
                };
                xhr.onerror = function () { cb(null); };
                xhr.send();
            } catch (e) { cb(null); }
        } catch (e) { cb(null); }
    }

    // Core tile updater: expects playlist items { title, artist, art }
    function updateLiveTileFromPlaylist(playlist) {
        try {
            try { console.info('updateLiveTileFromPlaylist called, length:', (playlist && playlist.length) || 0); } catch (e) { }
            if (typeof window.Windows === 'undefined') {
                try { console.info('Windows Runtime not available — skipping live tile update.'); } catch (e) { }
                return;
            }

            var Notifications = window.Windows.UI.Notifications;
            if (!Notifications || !Notifications.TileUpdateManager) {
                try { console.info('Tile APIs not available in this host.'); } catch (e) { }
                return;
            }

            var tileUpdater = Notifications.TileUpdateManager.createTileUpdaterForApplication();
            try { tileUpdater.enableNotificationQueue(true); } catch (e) { }
            try { tileUpdater.clear(); } catch (e) { }

            var limit = Math.min((playlist && playlist.length) || 0, 5);
            var tileType = Notifications.TileTemplateType;

            for (var i = 0; i < limit; i++) {
                var song = playlist[i] || {};
                var title = song.title || '';
                var artist = song.artist || '';
                var art = song.art || '';

                // Wide template (310x150)
                try {
                    var wideXml = Notifications.TileUpdateManager.getTemplateContent(tileType.tileWide310x150ImageAndText01);
                    var wideText = wideXml.getElementsByTagName('text');
                    var wideImg = wideXml.getElementsByTagName('image');

                    if (wideText && wideText.length > 0) {
                        try { wideText[0].appendChild(wideXml.createTextNode(title)); } catch (e) { }
                    }
                    if (wideText && wideText.length > 1) {
                        try { wideText[1].appendChild(wideXml.createTextNode(artist)); } catch (e) { }
                    }
                    if (wideImg && wideImg.length > 0 && art) {
                        try { wideImg[0].setAttribute('src', art); } catch (e) { }
                    }

                    var wideNotif = new Notifications.TileNotification(wideXml);
                    try { tileUpdater.update(wideNotif); } catch (e) { }
                } catch (e) {
                    try { console.warn('Failed to create wide tile for item', i, e); } catch (err) { }
                }

                // Square template (150x150)
                try {
                    var squareXml = Notifications.TileUpdateManager.getTemplateContent(tileType.tileSquare150x150PeekImageAndText02);
                    var squareText = squareXml.getElementsByTagName('text');
                    var squareImg = squareXml.getElementsByTagName('image');

                    if (squareText && squareText.length > 0) {
                        try { squareText[0].appendChild(squareXml.createTextNode(title)); } catch (e) { }
                    }
                    if (squareText && squareText.length > 1) {
                        try { squareText[1].appendChild(squareXml.createTextNode(artist)); } catch (e) { }
                    }
                    if (squareImg && squareImg.length > 0 && art) {
                        try { squareImg[0].setAttribute('src', art); } catch (e) { }
                    }

                    var squareNotif = new Notifications.TileNotification(squareXml);
                    try { tileUpdater.update(squareNotif); } catch (e) { }
                } catch (e) {
                    try { console.warn('Failed to create square tile for item', i, e); } catch (err) { }
                }
            }

            try { console.info('Live tile updated with', limit, 'items'); } catch (e) { }
        } catch (e) {
            try { console.warn('updateLiveTileFromPlaylist failed:', e); } catch (err) { }
        }
    }

    // Resolve up to 5 images then call the core updater
    function updateLiveTileWithResolvedImages(playlist) {
        try {
            if (!playlist || !playlist.length) { updateLiveTileFromPlaylist(playlist); return; }
            var limit = Math.min(playlist.length, 5);
            var resolved = [];
            var pending = limit;

            for (var i = 0; i < limit; i++) (function (i) {
                var song = playlist[i] || {};
                var artUrl = song.art || '';
                fetchToBlobUrl(artUrl, function (resUrl) {
                    resolved[i] = {
                        title: song.title || '',
                        artist: song.artist || '',
                        art: resUrl || ''
                    };
                    pending--;
                    if (pending === 0) {
                        try { updateLiveTileFromPlaylist(resolved); } catch (e) { console.warn('updateLiveTileFromPlaylist failed', e); }
                    }
                });
            })(i);
        } catch (e) {
            try { console.warn('updateLiveTileWithResolvedImages failed:', e); } catch (err) { }
        }
    }

    // Hook loadMusic so tiles update automatically when playlist is ready
    try {
        if (typeof window.loadMusic === 'function') {
            var origLoadMusic = window.loadMusic;
            window.loadMusic = function () {
                var ret;
                try { ret = origLoadMusic.apply(this, arguments); } catch (e) { try { console.warn('loadMusic wrapper: original threw', e); } catch (err) { } }
                try {
                    if (ret && typeof ret.then === 'function') {
                        ret.then(function () {
                            try {
                                if (typeof updateLiveTileWithResolvedImages === 'function') updateLiveTileWithResolvedImages(currentPlaylist);
                            } catch (e) { }
                        }).catch(function () { });
                    } else {
                        setTimeout(function () {
                            try {
                                if (typeof updateLiveTileWithResolvedImages === 'function') updateLiveTileWithResolvedImages(currentPlaylist);
                            } catch (e) { }
                        }, 300);
                    }
                } catch (e) { }
                return ret;
            };
        } else {
            setTimeout(function () {
                try {
                    if (typeof currentPlaylist !== 'undefined' && currentPlaylist && currentPlaylist.length) {
                        updateLiveTileWithResolvedImages(currentPlaylist);
                    }
                } catch (e) { }
            }, 1000);
        }
    } catch (e) {
        try { console.warn('Failed to hook loadMusic for live tile updates:', e); } catch (err) { }
    }

    // Expose manual triggers for debugging or explicit calls
    try {
        window.updateLiveTileWithResolvedImages = updateLiveTileWithResolvedImages;
        window.updateLiveTileFromPlaylist = updateLiveTileFromPlaylist;
    } catch (e) { }
})();

loadMusic();
