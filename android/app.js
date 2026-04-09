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

function loadMusic() {
    var url = 'https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml';
    
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

/* ---------- Live Tile Integration (All Tile Sizes) ---------- */
    function updateLiveTileFromXml() {
        if (!Notifications || !DataXml) return;

        var url = 'https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml?nocache=' + new Date().getTime();
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status === 200) {
                try {
                    var xml = xhr.responseXML;
                    if (!xml) xml = new DOMParser().parseFromString(xhr.responseText, 'text/xml');

                    var items = xml.getElementsByTagName('song');
                    var tileUpdater = Notifications.TileUpdateManager.createTileUpdaterForApplication();

                    tileUpdater.enableNotificationQueue(true);
                    tileUpdater.clear();

                    var limit = Math.min(items.length, 5);

                    for (var i = 0; i < limit; i++) {
                        var s = items[i];
                        var rawTitle = s.getElementsByTagName('title')[0] ? s.getElementsByTagName('title')[0].textContent : "";
                        var rawArtist = s.getElementsByTagName('artist')[0] ? s.getElementsByTagName('artist')[0].textContent : "";
                        var rawArt = s.getElementsByTagName('albumArt')[0] ? s.getElementsByTagName('albumArt')[0].textContent.trim() : "";

                        var albumArt = (rawArt && rawArt !== "placeholder.png") 
                                       ? escapeXml(rawArt) 
                                       : "ms-appx:///Assets/Square150x150Logo.png";

                        var title = escapeXml(rawTitle);
                        var artist = escapeXml(rawArtist);

                        // Comprehensive Adaptive XML for ALL sizes
                        var adaptiveXmlString = 
                            '<tile>' +
                            '  <visual version="2">' +
                            
                            // 1. SMALL TILE (71x71) - Text only, no room for art
                            '    <binding template="TileSmall">' +
                            '      <text hint-style="caption">' + title + '</text>' +
                            '    </binding>' +

                            // 2. MEDIUM TILE (150x150) - Peek layout
                            '    <binding template="TileMedium" branding="nameAndLogo">' +
                            '      <image placement="peek" src="' + albumArt + '"/>' +
                            '      <text hint-style="body" hint-wrap="true" hint-maxLines="2">' + title + '</text>' +
                            '      <text hint-style="captionSubtle" hint-wrap="true">' + artist + '</text>' +
                            '    </binding>' +

                            // 3. WIDE TILE (310x150) - Side-by-side layout
                            '    <binding template="TileWide" branding="nameAndLogo">' +
                            '      <group>' +
                            '        <subgroup hint-weight="1">' +
                            '          <image src="' + albumArt + '" hint-crop="none"/>' +
                            '        </subgroup>' +
                            '        <subgroup hint-weight="2" hint-textStacking="top">' +
                            '          <text hint-style="subtitle" hint-wrap="true" hint-maxLines="2">' + title + '</text>' +
                            '          <text hint-style="captionSubtle" hint-wrap="true">' + artist + '</text>' +
                            '        </subgroup>' +
                            '      </group>' +
                            '    </binding>' +

                            // 4. LARGE TILE (310x310) - Hero image + text below
                            '    <binding template="TileLarge" branding="nameAndLogo">' +
                            '      <image src="' + albumArt + '" hint-crop="none"/>' +
                            '      <text hint-style="title" hint-wrap="true">' + title + '</text>' +
                            '      <text hint-style="subtitleSubtle" hint-wrap="true">' + artist + '</text>' +
                            '    </binding>' +

                            '  </visual>' +
                            '</tile>';

                        var tileXml = new DataXml.XmlDocument();
                        tileXml.loadXml(adaptiveXmlString);

                        var tileNotification = new Notifications.TileNotification(tileXml);
                        tileNotification.tag = "song_" + i;

                        tileUpdater.update(tileNotification);
                    }
                } catch (e) {
                    try { console.warn('Tile update failed:', e); } catch (err) { }
                }
            }
        };
        xhr.send();
    }

loadMusic();
