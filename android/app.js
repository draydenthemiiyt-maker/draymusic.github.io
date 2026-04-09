var audio = document.getElementById('audioElement');
var songListContainer = document.getElementById('songList');
var searchInput = document.getElementById('searchInput');
var seekBar = document.getElementById('seekBar');
var progressFill = document.getElementById('progressFill');
var progressWrapper = document.querySelector('.progress-wrapper');

var allSongs = [];
var currentPlaylist = [];
var currentIndex = -1;
var isLooping = false;
var pendingSeekPercent = null;

function clampPercent(p) {
    var n = Number(p);
    if (isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

function updateSeekUI(percent) {
    var p = clampPercent(percent);
    if (seekBar) seekBar.value = p;
    if (progressFill) progressFill.style.width = p + '%';
}

function applySeekToAudio(percent) {
    if (!audio) return;
    var p = clampPercent(percent);

    if (!audio.duration || isNaN(audio.duration) || audio.duration === Infinity) {
        pendingSeekPercent = p;
        return;
    }

    var time = (p / 100) * audio.duration;

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
        var val = e.target.value;
        updateSeekUI(val);
        applySeekToAudio(val);
    }, false); // Passive removed as older engines sometimes bug out on it

    seekBar.addEventListener('change', function (e) {
        applySeekToAudio(e.target.value);
    });

    seekBar.addEventListener('pointerdown', startSeeking);
    seekBar.addEventListener('pointerup', stopSeeking);
    seekBar.addEventListener('pointercancel', stopSeeking);

    seekBar.addEventListener('touchstart', startSeeking, false);
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
            var pct = (audio.currentTime / audio.duration) * 100;
            updateSeekUI(pct);
        }
    });

    audio.addEventListener('timeupdate', function () {
        if (!progressWrapper || progressWrapper.classList.contains('seeking')) return;
        if (!audio.duration || isNaN(audio.duration)) return;
        var pct = (audio.currentTime / audio.duration) * 100;
        updateSeekUI(pct);
    });
}

// Fixed loadMusic: Chrome 50 does not support async/await
function loadMusic() {
    var url = 'https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml?nocache=' + Date.now();
    
    fetch(url)
        .then(function(response) { return response.text(); })
        .then(function(text) {
            var xml = new DOMParser().parseFromString(text, 'text/xml');
            var items = xml.getElementsByTagName('song') || [];
            
            // Convert HTMLCollection to Array manually for old engine safety
            allSongs = [];
            for (var k = 0; k < items.length; k++) {
                var s = items[k];
                var getText = function(tag) {
                    var el = s.getElementsByTagName(tag)[0];
                    return el && el.textContent ? el.textContent : '';
                };

                allSongs.push({
                    title: getText('title') || 'Unknown Title',
                    artist: getText('artist') || 'Unknown Artist',
                    url: getText('url') || '',
                    art: getText('albumArt') || 'placeholder.png'
                });
            }

            // Fisher-Yates Shuffle without destructuring
            for (var i = allSongs.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = allSongs[i];
                allSongs[i] = allSongs[j];
                allSongs[j] = temp;
            }

            currentPlaylist = allSongs.slice();
            renderList(currentPlaylist);
        })
        .catch(function(e) {
            console.warn('Failed to load music:', e);
        });
}

function renderList(data) {
    if (!songListContainer) return;

    var esc = function(str) { 
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
    };

    var html = '';
    for (var i = 0; i < data.length; i++) {
        var song = data[i];
        html += '<div class="song-card" data-index="' + i + '" style="animation-delay: ' + (i * 0.05) + 's">' +
                '<img src="' + esc(song.art) + '" alt="' + esc(song.title) + ' album art">' +
                '<div class="info">' +
                '<h4>' + esc(song.title) + '</h4>' +
                '<p>' + esc(song.artist) + '</p>' +
                '</div>' +
                '</div>';
    }
    songListContainer.innerHTML = html;

    var cards = songListContainer.querySelectorAll('.song-card');
    for (var j = 0; j < cards.length; j++) {
        cards[j].addEventListener('click', function () {
            var idx = Number(this.getAttribute('data-index'));
            playSong(idx);
        });
    }
}

function playSong(index) {
    if (!audio || currentPlaylist.length === 0) return;

    currentIndex = (index + currentPlaylist.length) % currentPlaylist.length;
    var song = currentPlaylist[currentIndex];
    if (!song || !song.url) return;

    audio.src = song.url;
    audio.play().catch(function(err) {
        console.warn('Playback failed:', err);
    });

    var titleEl = document.getElementById('currentTitle');
    var artistEl = document.getElementById('currentArtist');
    var artEl = document.getElementById('currentArt');
    var playBtn = document.getElementById('btnPlayPause');

    if (titleEl) titleEl.innerText = song.title;
    if (artistEl) artistEl.innerText = song.artist;
    if (artEl) artEl.src = song.art;
    if (playBtn) playBtn.innerHTML = '<span class="material-symbols-rounded">pause</span>';
}

function playNext() { playSong(currentIndex + 1); }
function playPrev() { playSong(currentIndex - 1); }

var btnPlayPause = document.getElementById('btnPlayPause');
if (btnPlayPause && audio) {
    btnPlayPause.onclick = function() {
        if (audio.paused) {
            audio.play().catch(function() { });
            btnPlayPause.innerHTML = '<span class="material-symbols-rounded">pause</span>';
        } else {
            audio.pause();
            btnPlayPause.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        }
    };
}

var btnNext = document.getElementById('btnNext');
var btnPrev = document.getElementById('btnPrev');
if (btnNext) btnNext.onclick = function() { playSong(currentIndex + 1); };
if (btnPrev) btnPrev.onclick = function() { playSong(currentIndex - 1); };

var btnLoop = document.getElementById('btnLoop');
if (btnLoop) {
    btnLoop.onclick = function() {
        isLooping = !isLooping;
        if (isLooping) {
            btnLoop.classList.add('active');
        } else {
            btnLoop.classList.remove('active');
        }
    };
}

if (audio) {
    audio.onended = function() {
        if (isLooping) {
            audio.currentTime = 0;
            audio.play().catch(function() { });
        } else {
            playSong(currentIndex + 1);
        }
    };
}

if (searchInput) {
    searchInput.oninput = function() {
        var q = (searchInput.value || '').toLowerCase();
        currentPlaylist = allSongs.filter(function(s) {
            return (s.title || '').toLowerCase().indexOf(q) !== -1 ||
                   (s.artist || '').toLowerCase().indexOf(q) !== -1;
        });
        renderList(currentPlaylist);
    };
}

/* ===== Windows UWP integration (ES5-safe) ===== */
(function initWindowsIntegration() {
    if (typeof window.Windows === 'undefined') return;

    // Helper to prevent XML from breaking on special characters (&, <, >, etc.)
    function escapeXml(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    try {
        if (document.body) {
            document.body.classList.add('win-type-body');
        } else {
            document.addEventListener("DOMContentLoaded", function() {
                document.body.classList.add('win-type-body');
            });
        }
    } catch (e) { }

    var Win = window.Windows || {};
    var ViewMgmt = (Win.UI && Win.UI.ViewManagement) ? Win.UI.ViewManagement : null;
    var Media = Win.Media || null;
    var Storage = Win.Storage || null;
    var Foundation = Win.Foundation || null;
    var Notifications = Win.UI.Notifications || null;
    var DataXml = Win.Data.Xml.Dom || null;

function updateLiveTileMinimal() {
        var Notifications = window.Windows.UI.Notifications;
        var DataXml = window.Windows.Data.Xml.Dom;
        
        // Use the currently playing song if available, otherwise fetch the XML
        var currentSong = (typeof currentPlaylist !== 'undefined' && currentPlaylist[currentIndex]) ? currentPlaylist[currentIndex] : null;
        
        // If no song is playing yet, we just exit or wait for playSong() to trigger this
        if (!currentSong) return;

        try {
            var title = escapeXml(currentSong.title);
            var artist = escapeXml(currentSong.artist);
            var art = currentSong.art || "ms-appx:///Assets/StoreLogo.png";
            var albumArt = escapeXml(art);

            var tileXmlString = 
                '<tile>' +
                '  <visual version="2">' +
                '    <binding template="TileSmall">' +
                '      <text hint-style="caption">' + title + '</text>' +
                '    </binding>' +
                '    <binding template="TileMedium" branding="none">' +
                '      <image src="' + albumArt + '" placement="background" hint-overlay="60"/>' +
                '      <text hint-style="body" hint-wrap="true" hint-align="center">' + title + '</text>' +
                '      <text hint-style="captionSubtle" hint-wrap="true" hint-align="center">' + artist + '</text>' +
                '    </binding>' +
                '    <binding template="TileWide" branding="name">' +
                '      <group>' +
                '        <subgroup hint-weight="33"><image src="' + albumArt + '" /></subgroup>' +
                '        <subgroup>' +
                '          <text hint-style="subtitle">' + title + '</text>' +
                '          <text hint-style="captionSubtle">' + artist + '</text>' +
                '        </subgroup>' +
                '      </group>' +
                '    </binding>' +
                '    <binding template="TileLarge" branding="nameAndLogo">' +
                '      <image src="' + albumArt + '" placement="background" hint-overlay="40"/>' +
                '      <text hint-style="header" hint-wrap="true">' + title + '</text>' +
                '      <text hint-style="subtitleSubtle" hint-wrap="true">' + artist + '</text>' +
                '    </binding>' +
                '  </visual>' +
                '</tile>';

            var tileXml = new DataXml.XmlDocument();
            tileXml.loadXml(tileXmlString);
            Notifications.TileUpdateManager.createTileUpdaterForApplication().update(new Notifications.TileNotification(tileXml));
        } catch (e) { 
            console.warn('Tile update failed:', e); 
        }
    }

    // Connect the Tile update to your playSong function
    var originalPlaySong = window.playSong;
    window.playSong = function(index) {
        originalPlaySong(index);
        // Delay slightly to ensure metadata is ready
        setTimeout(updateLiveTileMinimal, 500);
    };

})();

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
                    var status = (typeof audio !== 'undefined' && audio && !audio.paused) ? Media.MediaPlaybackStatus.playing : Media.MediaPlaybackStatus.paused;
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

                    var song = (typeof currentPlaylist !== 'undefined' && currentPlaylist && typeof currentPlaylist[currentIndex] !== 'undefined') ? currentPlaylist[currentIndex] : null;
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
                                if (typeof audio !== 'undefined' && audio && audio.play) { try { audio.play().catch(function () { }); } catch (e) { try { audio.play(); } catch (err) { } } }
                                break;
                            case Media.SystemMediaTransportControlsButton.pause:
                                if (typeof audio !== 'undefined' && audio && audio.pause) { try { audio.pause(); } catch (e) { } }
                                break;
                            case Media.SystemMediaTransportControlsButton.next:
                                if (typeof playNext === 'function') { try { playNext(); } catch (e) { } } else if (typeof playSong === 'function' && typeof currentIndex !== 'undefined') { try { playSong(currentIndex + 1); } catch (e) { } }
                                break;
                            case Media.SystemMediaTransportControlsButton.previous:
                                if (typeof playPrev === 'function') { try { playPrev(); } catch (e) { } } else if (typeof playSong === 'function' && typeof currentIndex !== 'undefined') { try { playSong(currentIndex - 1); } catch (e) { } }
                                break;
                            case Media.SystemMediaTransportControlsButton.fastForward:
                                if (typeof audio !== 'undefined' && audio && audio.duration && !isNaN(audio.duration)) {
                                    try { audio.currentTime = Math.min(audio.duration, (audio.currentTime || 0) + 10); } catch (e) { }
                                }
                                break;
                            case Media.SystemMediaTransportControlsButton.rewind:
                                if (typeof audio !== 'undefined' && audio) {
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

            if (typeof audio !== 'undefined' && audio) {
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
})();

loadMusic();
