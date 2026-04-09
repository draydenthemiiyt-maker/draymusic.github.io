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
    }, false);

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

function loadMusic() {
    var url = 'https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml?nocache=' + Date.now();
    
    fetch(url)
        .then(function(response) { return response.text(); })
        .then(function(text) {
            var xml = new DOMParser().parseFromString(text, 'text/xml');
            var items = xml.getElementsByTagName('song') || [];
            
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

    updateSeekUI(0);

    audio.src = song.url;
    var playPromise = audio.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(function(err) {
            console.warn('Playback failed:', err);
        });
    }

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
        btnLoop.classList.toggle('active', isLooping);
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

/* ===== Windows UWP integration ===== */
(function initWindowsIntegration() {
    if (typeof window.Windows === 'undefined') return;

    function escapeXml(str) {
        if (!str) return '';
        return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }
    
    try {
        if (document.body) document.body.classList.add('win-type-body');
    } catch (e) { }

    var Win = window.Windows;
    var ViewMgmt = Win.UI.ViewManagement;
    var Media = Win.Media;
    var Notifications = Win.UI.Notifications;
    var DataXml = Win.Data.Xml.Dom;

    function updateLiveTileMinimal() {
        var currentSong = currentPlaylist[currentIndex];
        if (!currentSong) return;

        try {
            var title = escapeXml(currentSong.title);
            var artist = escapeXml(currentSong.artist);
            var albumArt = escapeXml(currentSong.art || "ms-appx:///Assets/StoreLogo.png");

            var tileXmlString = '<tile><visual version="2">' +
                '<binding template="TileMedium" branding="none"><image src="' + albumArt + '" placement="background" hint-overlay="60"/><text hint-style="body" hint-wrap="true">' + title + '</text></binding>' +
                '<binding template="TileWide" branding="name"><group><subgroup hint-weight="33"><image src="' + albumArt + '"/></subgroup><subgroup><text hint-style="subtitle">' + title + '</text><text hint-style="captionSubtle">' + artist + '</text></subgroup></group></binding>' +
                '</visual></tile>';

            var tileXml = new DataXml.XmlDocument();
            tileXml.loadXml(tileXmlString);
            Notifications.TileUpdateManager.createTileUpdaterForApplication().update(new Notifications.TileNotification(tileXml));
        } catch (e) { console.warn('Tile update failed'); }
    }

    // Combined PlaySong Override
    var originalPlaySong = window.playSong;
    window.playSong = function(index) {
        var result = originalPlaySong(index);
        setTimeout(function() {
            updateLiveTileMinimal();
            if (typeof updateSmtcMetadata === 'function') updateSmtcMetadata();
        }, 500);
        return result;
    };

    /* SMTC Integration */
    if (Media && Media.SystemMediaTransportControls) {
        var smtc = Media.SystemMediaTransportControls.getForCurrentView();
        smtc.isEnabled = true;
        smtc.isPlayEnabled = true;
        smtc.isPauseEnabled = true;
        smtc.isNextEnabled = true;
        smtc.isPreviousEnabled = true;

        window.updateSmtcMetadata = function() {
            var song = currentPlaylist[currentIndex];
            if (!song) return;
            var updater = smtc.displayUpdater;
            updater.type = Media.MediaPlaybackType.music;
            updater.musicProperties.title = song.title;
            updater.musicProperties.artist = song.artist;
            updater.update();
        };

        smtc.addEventListener('buttonpressed', function(ev) {
            var btn = Media.SystemMediaTransportControlsButton;
            if (ev.button === btn.play) audio.play();
            if (ev.button === btn.pause) audio.pause();
            if (ev.button === btn.next) playNext();
            if (ev.button === btn.previous) playPrev();
        });
    }
})();

loadMusic();
