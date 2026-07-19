var DOM = {
    audio: document.getElementById('audioElement'),
    songList: document.getElementById('songList'),
    searchInput: document.getElementById('searchInput'),
    seekBar: document.getElementById('seekBar'),
    progressFill: document.getElementById('progressFill'),
    progressWrapper: document.querySelector('.progress-wrapper'),
    eqPane: document.getElementById('eqPane'),
    btnEQ: document.getElementById('btnEQ'),
    btnCloseEQ: document.getElementById('btnCloseEQ'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    btnNext: document.getElementById('btnNext'),
    btnPrev: document.getElementById('btnPrev'),
    btnLoop: document.getElementById('btnLoop'),
    currentTitle: document.getElementById('currentTitle'),
    currentArtist: document.getElementById('currentArtist'),
    currentArt: document.getElementById('currentArt'),
    speedSlider: document.getElementById('speedSlider'),
    speedLabel: document.getElementById('speedLabel'),
    preservePitch: document.getElementById('preservePitch'),
    drySlider: document.getElementById('drySlider'),
    wetSlider: document.getElementById('wetSlider'),
    favoritesContainer: document.getElementById('favoritesContainer'),
    playlistsContainer: document.getElementById('playlistsContainer'),
    playlistMainView: document.getElementById('playlistMainView'),
    playlistDetailView: document.getElementById('playlistDetailView'),
    detailPlaylistTitle: document.getElementById('detailPlaylistTitle'),
    playlistSongsContainer: document.getElementById('playlistSongsContainer'),
    btnBackToPlaylists: document.getElementById('btnBackToPlaylists'),
    btnPageCreatePlaylist: document.getElementById('btnPageCreatePlaylist'),
    pageNewPlaylistInput: document.getElementById('pageNewPlaylistInput'),
    pageContainer: document.getElementById('pageContainer'),
    btnBackToSongs: document.getElementById('btnBackToSongs'),
    navLeft: document.getElementById('navLeft'),
    navRight: document.getElementById('navRight'),
    contextMenu: document.getElementById('contextMenu'),
    contextSongOptions: document.getElementById('contextSongOptions'),
    contextPlaylistOptions: document.getElementById('contextPlaylistOptions'),
    contextPlaylistItems: document.getElementById('contextPlaylistItems'),
    btnCreatePlaylist: document.getElementById('btnCreatePlaylist'),
    newPlaylistInput: document.getElementById('newPlaylistInput'),
    btnRenamePlaylist: document.getElementById('btnRenamePlaylist'),
    btnDeletePlaylist: document.getElementById('btnDeletePlaylist'),
    btnFavorite: document.getElementById('btnFavorite'),
    btnStop: document.getElementById('btnStop'),
    btnOverflowMenu: document.getElementById('btnOverflowMenu'),
    contextPlayerOptions: document.getElementById('contextPlayerOptions'),
    menuBtnLoop: document.getElementById('menuBtnLoop'),
    menuBtnEQ: document.getElementById('menuBtnEQ'),
    menuBtnStop: document.getElementById('menuBtnStop'),
    menuBtnFavorite: document.getElementById('menuBtnFavorite')
};

window.audio = DOM.audio;

var allSongs = [];
var currentPlaylist = [];
var currentIndex = -1;
var isLooping = false;
var pendingSeekPercent = null;
var activeTargetSong = null;
var activeTargetPlaylist = null;
var currentPage = 0;
var totalPages = 4;
var favoriteUrls = JSON.parse(localStorage.getItem('drayFavorites') || '[]');
var userPlaylists = JSON.parse(localStorage.getItem('drayPlaylists') || '{}');
var audioCtx = null;
var filters = [];
var reverbNode, dryGain, wetGain;

var offlineDB = null;

window.addEventListener('online', function () {
    loadMusic();
});

window.addEventListener('offline', function () {
    loadOfflineSongs(function (songs) {
        allSongs = songs;
        currentPlaylist = allSongs.slice(0);
        renderList(currentPlaylist);
    });
});

function openOfflineDB(callback) {
    if (!('indexedDB' in window)) return;
    var req = window.indexedDB.open('DrayMusicOffline', 1);

    req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('songs')) {
            var store = db.createObjectStore('songs', { keyPath: 'url' });
            store.createIndex('favorite', 'favorite', { unique: false });
            store.createIndex('playlists', 'playlists', { unique: false });
        }
    };

    req.onsuccess = function (e) {
        offlineDB = e.target.result;
        if (callback) callback();
    };

    req.onerror = function () { console.log('DB error'); };
}

function syncSongOffline(songUrl) {
    if (!offlineDB || !songUrl) return;

    var song = null;
    for (var i = 0; i < allSongs.length; i++) {
        if (allSongs[i].url === songUrl) {
            song = allSongs[i];
            break;
        }
    }
    if (!song) {
        for (var i = 0; i < currentPlaylist.length; i++) {
            if (currentPlaylist[i].url === songUrl) {
                song = currentPlaylist[i];
                break;
            }
        }
    }

    var isFav = favoriteUrls.indexOf(songUrl) !== -1;
    var containingPlaylists = [];
    var playlistNames = Object.keys(userPlaylists);
    for (var i = 0; i < playlistNames.length; i++) {
        var pName = playlistNames[i];
        if (userPlaylists[pName] && userPlaylists[pName].indexOf(songUrl) !== -1) {
            containingPlaylists.push(pName);
        }
    }

    var isNeeded = isFav || containingPlaylists.length > 0;

    var tx = offlineDB.transaction(['songs'], 'readwrite');
    var store = tx.objectStore('songs');
    var req = store.get(songUrl);

    req.onsuccess = function (e) {
        var record = e.target.result;

        if (!isNeeded) {
            if (record) {
                var delTx = offlineDB.transaction(['songs'], 'readwrite');
                delTx.objectStore('songs')['delete'](songUrl);
                console.log('Removed from offline cache:', songUrl);

                if (!navigator.onLine) {
                    allSongs = allSongs.filter(function (s) { return s.url !== songUrl; });
                    currentPlaylist = currentPlaylist.filter(function (s) { return s.url !== songUrl; });
                    renderList(currentPlaylist);
                    if (currentPage === 1) renderFavorites();
                    if (currentPage === 2) {
                        renderPlaylists();
                        if (DOM.playlistDetailView && DOM.playlistDetailView.style.display === 'block' && DOM.detailPlaylistTitle) {
                            renderPlaylistDetail(DOM.detailPlaylistTitle.textContent);
                        }
                    }
                }
            }
            return;
        }

        if (record) {
            record.favorite = isFav;
            record.playlists = containingPlaylists;
            if (song) {
                record.title = song.title;
                record.artist = song.artist;
                record.art = song.art;
            }
            var updateTx = offlineDB.transaction(['songs'], 'readwrite');
            updateTx.objectStore('songs').put(record);
            console.log('Updated offline flags for:', songUrl);
        } else {
            if (song && navigator.onLine) {
                fetch(songUrl).then(function (res) {
                    return res.blob();
                }).then(function (blob) {
                    var newRecord = {
                        url: songUrl,
                        title: song.title,
                        artist: song.artist,
                        art: song.art,
                        favorite: isFav,
                        playlists: containingPlaylists,
                        blob: blob
                    };
                    var insertTx = offlineDB.transaction(['songs'], 'readwrite');
                    insertTx.objectStore('songs').put(newRecord);
                    console.log('Cached new song offline:', songUrl);
                })['catch'](function (err) {
                    console.error('Offline cache download failed', err);
                });
            }
        }
    };
}

function isWidgetApp() {
    return document.body.className.indexOf('widgetapp') !== -1;
}

function escapeHTML(str) {
    return String(str || '').replace(/[&"<>\']/g, function (m) {
        return ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;' })[m];
    });
}

function clampPercent(p) {
    return Math.max(0, Math.min(100, Number(p) || 0));
}

function saveFavorites() {
    localStorage.setItem('drayFavorites', JSON.stringify(favoriteUrls));
}

function savePlaylists() {
    localStorage.setItem('drayPlaylists', JSON.stringify(userPlaylists));
}

function safePlay(audioElement) {
    if (!audioElement) return;
    var playPromise = audioElement.play();
    if (playPromise !== undefined && typeof playPromise['catch'] === 'function') {
        playPromise['catch'](function (err) {
            console.warn('Playback failed or blocked by browser:', err);
        });
    }
}

function updateSeekUI(percent) {
    var p = clampPercent(percent);
    if (DOM.seekBar) DOM.seekBar.value = p;
    if (DOM.progressFill) DOM.progressFill.style.width = p + '%';
}

function applySeekToAudio(percent) {
    if (!DOM.audio) return;
    var p = clampPercent(percent);

    if (!DOM.audio.duration || !isFinite(DOM.audio.duration)) {
        pendingSeekPercent = p;
        return;
    }

    var time = (p / 100) * DOM.audio.duration;

    if (typeof DOM.audio.fastSeek === 'function') {
        try { DOM.audio.fastSeek(time); }
        catch (e) { DOM.audio.currentTime = time; }
    } else {
        DOM.audio.currentTime = time;
    }
    pendingSeekPercent = null;
}

function updateMediaSession(song) {
    if (!song) return;
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title || '',
            artist: song.artist || '',
            album: song.album || 'DrayMusic',
            artwork: [
                { src: song.art || 'placeholder.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', function () {
            safePlay(DOM.audio);
        });
        navigator.mediaSession.setActionHandler('pause', function () {
            DOM.audio.pause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', function () {
            playSong(currentIndex - 1);
        });
        navigator.mediaSession.setActionHandler('nexttrack', function () {
            playSong(currentIndex + 1);
        });
        navigator.mediaSession.setActionHandler('stop', function () {
            DOM.audio.pause();
            DOM.audio.currentTime = 0;
            if (DOM.btnPlayPause) DOM.btnPlayPause.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        });
    }
}

function playSong(index) {
    if (!DOM.audio || currentPlaylist.length === 0) return;

    currentIndex = (index + currentPlaylist.length) % currentPlaylist.length;
    var song = currentPlaylist[currentIndex];
    if (!song || !song.url) return;

    DOM.audio.src = song.blobUrl || song.url;
    safePlay(DOM.audio);
    document.querySelector('.mini-player').classList.remove('notplaying');

    updatePlayback();

    if (DOM.currentTitle) DOM.currentTitle.textContent = song.title;
    if (DOM.currentArtist) DOM.currentArtist.textContent = song.artist;
    if (DOM.currentArt) DOM.currentArt.src = song.art;
    if (DOM.btnPlayPause) DOM.btnPlayPause.innerHTML = '<span class="material-symbols-rounded">pause</span>';
    if (DOM.btnFavorite) {
        if (favoriteUrls.indexOf(song.url) !== -1) {
            DOM.btnFavorite.classList.add('fav-active');
            if (DOM.menuBtnFavorite) DOM.menuBtnFavorite.classList.add('fav-active');
        } else {
            DOM.btnFavorite.classList.remove('fav-active');
            if (DOM.menuBtnFavorite) DOM.menuBtnFavorite.classList.remove('fav-active');
        }
    }

    updateMediaSession(song);
    if (window.audio !== DOM.audio) window.audio = DOM.audio;
    syncSongOffline(song.url);

var bg = document.getElementById('body-bg');
    if (bg) {
        bg.src = song.art;
        applyDynamicAccent(song.art); // <-- Add this line
    }
}

function loadMusic() {
    var url = 'https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml?nocache=' + new Date().getTime();
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            var xml;
            try {
                xml = new window.DOMParser().parseFromString(xhr.responseText, 'text/xml');
            } catch (e) { console.error('XML Parse Error', e); return; }

            var items = xml.getElementsByTagName('song');
            allSongs = [];

            for (var i = 0; i < items.length; i++) {
                var s = items[i];
                var getT = function (tag) {
                    var el = s.getElementsByTagName(tag)[0];
                    return el ? el.textContent : '';
                };
                allSongs.push({
                    title: getT('title') || 'Unknown Title',
                    artist: getT('artist') || 'Unknown Artist',
                    url: getT('url') || '',
                    art: getT('albumArt') || 'placeholder.png'
                });
            }

            for (var k = allSongs.length - 1; k > 0; k--) {
                var j = Math.floor(Math.random() * (k + 1));
                var temp = allSongs[k];
                allSongs[k] = allSongs[j];
                allSongs[j] = temp;
            }

            currentPlaylist = allSongs.slice(0);
            renderList(currentPlaylist);
        } else {
            console.error('Network error loading music');
        }
    };
    xhr.onerror = function () { console.error('Network error loading music'); };
    xhr.send();
}

function renderList(data, container) {
    if (!container) container = DOM.songList;
    if (!container) return;

    var html = '';
    for (var i = 0; i < data.length; i++) {
        var song = data[i];
        var isFav = (favoriteUrls.indexOf(song.url) !== -1);
        var starClass = isFav ? 'star-btn fav-active' : 'star-btn';

        html += '<div class="song-card" data-index="' + i + '" data-url="' + escapeHTML(song.url) + '" style="animation-delay: ' + (i * 0.05) + 's">' +
            '<img src="' + escapeHTML(song.art) + '" alt="art">' +
            '<div class="info" style="flex:1;">' +
            '<h4>' + escapeHTML(song.title) + '</h4>' +
            '<p>' + escapeHTML(song.artist) + '</p>' +
            '</div>' +
            '<button class="' + starClass + '" title="Favorite">' +
            '<span class="material-symbols-rounded">star</span>' +
            '</button>' +
            '</div>';
    }
    container.innerHTML = html;

    var cards = container.querySelectorAll('.song-card');
    for (var c = 0; c < cards.length; c++) {
        (function (card, idx) {
            card.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('button')) return;
                currentPlaylist = data.slice(0);
                playSong(idx);
            });

            var starBtn = card.querySelector('.star-btn');
            if (starBtn) {
                starBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var songUrl = card.getAttribute('data-url');
                    var favIdx = favoriteUrls.indexOf(songUrl);

                    if (DOM.btnFavorite && currentPlaylist[currentIndex] && currentPlaylist[currentIndex].url === songUrl) {
                        if (favIdx === -1) {
                            DOM.btnFavorite.classList.add('fav-active');
                        } else {
                            DOM.btnFavorite.classList.remove('fav-active');
                        }
                    }

                    if (favIdx === -1) {
                        favoriteUrls.push(songUrl);
                        starBtn.classList.add('fav-active');
                    } else {
                        favoriteUrls.splice(favIdx, 1);
                        starBtn.classList.remove('fav-active');
                    }
                    saveFavorites();
                    syncSongOffline(songUrl);
                    if (currentPage === 1) renderFavorites();
                });
            }

            var touchTimer;
            var triggerContext = function (e, pageX, pageY) {
                e.preventDefault();
                showSongContextMenu(pageX, pageY, data[idx]);
            };

            card.addEventListener('contextmenu', function (e) {
                e.stopPropagation();
                triggerContext(e, e.pageX, e.pageY);
            });
            card.addEventListener('touchstart', function (e) {
                var touch = e.touches[0];
                touchTimer = setTimeout(function () { triggerContext(e, touch.pageX, touch.pageY); }, 600);
            }, { passive: true });
            card.addEventListener('touchend', function () { clearTimeout(touchTimer); });
            card.addEventListener('touchmove', function () { clearTimeout(touchTimer); });

        })(cards[c], Number(cards[c].getAttribute('data-index')));
    }
}

function renderFavorites() {
    if (!DOM.favoritesContainer) return;
    var favSongs = allSongs.filter(function (s) {
        return favoriteUrls.indexOf(s.url) !== -1;
    });
    if (favSongs.length === 0) {
        DOM.favoritesContainer.innerHTML = '<p style="text-align:center; color: #938f99;">No favorites yet.</p>';
    } else {
        renderList(favSongs, DOM.favoritesContainer);
    }
}

function renderPlaylists() {
    if (!DOM.playlistsContainer) return;

    var html = '';
    var playlistNames = Object.keys(userPlaylists);

    for (var p = 0; p < playlistNames.length; p++) {
        var pName = playlistNames[p];
        var songUrls = userPlaylists[pName] || [];
        var plSongs = allSongs.filter(function (s) { return songUrls.indexOf(s.url) !== -1; });

        var grids = '';
        for (var i = 0; i < 4; i++) {
            if (plSongs[i]) {
                grids += '<img src="' + escapeHTML(plSongs[i].art) + '" alt="art">';
            } else {
                grids += '<div class="blank-square"></div>';
            }
        }

        html += '<div class="playlist-card" data-name="' + escapeHTML(pName) + '">' +
            '<div class="playlist-art-grid">' + grids + '</div>' +
            '<h4>' + escapeHTML(pName) + '</h4>' +
            '<span>' + songUrls.length + ' songs</span>' +
            '</div>';
    }
    DOM.playlistsContainer.innerHTML = html;

    var folders = DOM.playlistsContainer.querySelectorAll('.playlist-card');
    for (var f = 0; f < folders.length; f++) {
        (function (folder) {
            var name = folder.getAttribute('data-name');

            folder.addEventListener('click', function () {
                if (DOM.detailPlaylistTitle) DOM.detailPlaylistTitle.textContent = name;
                DOM.playlistMainView.style.display = 'none';
                DOM.playlistDetailView.style.display = 'block';
                renderPlaylistDetail(name);
            });

            folder.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                e.stopPropagation();
                showPlaylistContextMenu(e.pageX, e.pageY, name);
            });

        })(folders[f]);
    }
}

function renderPlaylistDetail(playlistName) {
    var songUrls = userPlaylists[playlistName] || [];
    var plSongs = allSongs.filter(function (s) { return songUrls.indexOf(s.url) !== -1; });

    var html = '';
    for (var i = 0; i < plSongs.length; i++) {
        var s = plSongs[i];
        html += '<div class="song-card">' +
            '<img src="' + escapeHTML(s.art) + '" alt="art">' +
            '<div class="info" onclick="window.playSongFromList(\'' + escapeHTML(s.url) + '\')">' +
            '<h4>' + escapeHTML(s.title) + '</h4>' +
            '<p>' + escapeHTML(s.artist) + '</p>' +
            '</div>' +
            '<button class="remove-btn icon-btn" data-url="' + escapeHTML(s.url) + '">' +
            '<span class="material-symbols-rounded">delete</span>' +
            '</button>' +
            '</div>';
    }
    DOM.playlistSongsContainer.innerHTML = html;

    var removeBtns = DOM.playlistSongsContainer.querySelectorAll('.remove-btn');
    for (var b = 0; b < removeBtns.length; b++) {
        (function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var urlToRemove = btn.getAttribute('data-url');
                var currentArr = userPlaylists[playlistName];
                var filtered = [];
                for (var k = 0; k < currentArr.length; k++) {
                    if (currentArr[k] !== urlToRemove) filtered.push(currentArr[k]);
                }
                userPlaylists[playlistName] = filtered;
                savePlaylists();
                syncSongOffline(urlToRemove);
                renderPlaylistDetail(playlistName);
                renderPlaylists();
            });
        })(removeBtns[b]);
    }
}

window.playSongFromList = function (url) {
    for (var i = 0; i < allSongs.length; i++) {
        if (allSongs[i].url === url) {
            currentPlaylist = [allSongs[i]];
            playSong(0);
            break;
        }
    }
};

function updateNavArrows() {
    if (isWidgetApp()) {
        if (DOM.navLeft) DOM.navLeft.style.display = 'none';
        if (DOM.navRight) DOM.navRight.style.display = 'none';
        return;
    }
    if (DOM.navLeft) DOM.navLeft.style.display = (currentPage === 0) ? 'none' : 'flex';
    if (DOM.navRight) DOM.navRight.style.display = (currentPage === totalPages - 1) ? 'none' : 'flex';
}

function goToPage(index) {
    if (isWidgetApp() && index !== 0) return;

    currentPage = index;
    if (DOM.pageContainer) DOM.pageContainer.style.transform = 'translateX(' + (-index * (100 / totalPages)) + '%)';
    if (index === 1) renderFavorites();
    if (index === 2) renderPlaylists();
    updateNavArrows();
}

function positionContextMenu(x, y) {
    DOM.contextMenu.style.visibility = 'hidden';
    DOM.contextMenu.style.display = 'block';

    var menuWidth = DOM.contextMenu.offsetWidth || 220;
    var menuHeight = DOM.contextMenu.offsetHeight || 250;

    var posX = Math.max(15, Math.min(x, window.innerWidth - menuWidth - 15));
    var posY = Math.max(15, Math.min(y, window.innerHeight - menuHeight - 15));

    DOM.contextMenu.style.left = posX + 'px';
    DOM.contextMenu.style.top = posY + 'px';
    DOM.contextMenu.style.visibility = 'visible';
}

function showSongContextMenu(x, y, song) {
    if (!DOM.contextMenu || !DOM.contextPlaylistItems) return;
    activeTargetSong = song;
    activeTargetPlaylist = null;

    DOM.contextPlaylistOptions.style.display = 'none';
    DOM.contextSongOptions.style.display = 'block';

    if (DOM.contextPlayerOptions) DOM.contextPlayerOptions.style.display = 'none';

    positionContextMenu(x, y);

    var html = '';
    var playlistNames = Object.keys(userPlaylists);
    for (var i = 0; i < playlistNames.length; i++) {
        var pName = playlistNames[i];
        var hasSong = (userPlaylists[pName].indexOf(song.url) !== -1);
        var icon = hasSong ? 'check_box' : 'check_box_outline_blank';
        var accentColor = '#00a0ff';

        html += '<li data-name="' + escapeHTML(pName) + '">' + escapeHTML(pName) +
            '<span class="material-symbols-rounded" style="color:' + accentColor + '">' + icon + '</span></li>';
    }
    DOM.contextPlaylistItems.innerHTML = html;

    var items = DOM.contextPlaylistItems.querySelectorAll('li');
    for (var j = 0; j < items.length; j++) {
        (function (item) {
            item.addEventListener('click', function () {
                var name = item.getAttribute('data-name');
                var idx = userPlaylists[name].indexOf(activeTargetSong.url);

                if (idx === -1) userPlaylists[name].push(activeTargetSong.url);
                else userPlaylists[name].splice(idx, 1);

                savePlaylists();
                syncSongOffline(activeTargetSong.url);
                renderPlaylists();

                if (DOM.playlistDetailView && DOM.playlistDetailView.style.display === 'block' && DOM.detailPlaylistTitle && DOM.detailPlaylistTitle.textContent === name) {
                    renderPlaylistDetail(name);
                }
                DOM.contextMenu.style.display = 'none';
            });
        })(items[j]);
    }
}

function showPlaylistContextMenu(x, y, playlistName) {
    if (!DOM.contextMenu) return;
    activeTargetPlaylist = playlistName;
    activeTargetSong = null;

    DOM.contextSongOptions.style.display = 'none';
    DOM.contextPlaylistOptions.style.display = 'block';

    if (DOM.contextPlayerOptions) DOM.contextPlayerOptions.style.display = 'none';

    positionContextMenu(x, y);
}

function createImpulseResponse(duration, decay) {
    if (!audioCtx) return null;
    var sampleRate = audioCtx.sampleRate;
    var length = sampleRate * duration;
    var impulse = audioCtx.createBuffer(2, length, sampleRate);

    for (var i = 0; i < 2; i++) {
        var channelData = impulse.getChannelData(i);
        for (var j = 0; j < length; j++) {
            channelData[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
        }
    }
    return impulse;
}

function initAudioEngine() {
    if (audioCtx) return;
    try {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        audioCtx = new AudioContextClass();
        var source = audioCtx.createMediaElementSource(DOM.audio);
        var freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        var lastNode = source;

        for (var i = 0; i < freqs.length; i++) {
            var f = audioCtx.createBiquadFilter();
            f.type = (i === 0) ? 'lowshelf' : ((i === 9) ? 'highshelf' : 'peaking');
            f.frequency.value = freqs[i];
            f.gain.value = 0;
            lastNode.connect(f);
            filters.push(f);
            lastNode = f;
        }

        dryGain = audioCtx.createGain();
        wetGain = audioCtx.createGain();
        dryGain.gain.value = 1;
        wetGain.gain.value = 0;

        reverbNode = audioCtx.createConvolver();
        reverbNode.buffer = createImpulseResponse(3, 4);

        lastNode.connect(dryGain);
        lastNode.connect(reverbNode);
        reverbNode.connect(wetGain);
        dryGain.connect(audioCtx.destination);
        wetGain.connect(audioCtx.destination);
    } catch (e) {
        console.warn("Audio Engine Init Failed (Normal for IE11):", e);
    }
}

function updatePlayback() {
    if (!DOM.audio) return;
    if (DOM.speedSlider) {
        var speed = parseFloat(DOM.speedSlider.value);
        DOM.audio.playbackRate = speed;
        if (DOM.speedLabel) DOM.speedLabel.textContent = speed.toFixed(2) + 'x';
    }
    if (DOM.preservePitch) {
        var lock = DOM.preservePitch.checked;
        DOM.audio.preservesPitch = lock;
        DOM.audio.mozPreservesPitch = lock;
    }
}

function bindLiveSlider(el, callback) {
    if (!el) return;
    el.addEventListener('input', callback);
    el.addEventListener('change', callback);
}

function bindEvents() {
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
    });

    if (DOM.btnEQ && DOM.eqPane) {
        DOM.btnEQ.addEventListener('click', function () { DOM.eqPane.classList.add('open'); });
    }
    if (DOM.btnCloseEQ && DOM.eqPane) {
        DOM.btnCloseEQ.addEventListener('click', function () { DOM.eqPane.classList.remove('open'); });
    }

    if (DOM.btnPlayPause) {
        DOM.btnPlayPause.addEventListener('click', function () {
            if (DOM.audio.paused) {
                safePlay(DOM.audio);
                DOM.btnPlayPause.innerHTML = '<span class="material-symbols-rounded">pause</span>';
            } else {
                DOM.audio.pause();
                DOM.btnPlayPause.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
            }
        });
    }

    if (DOM.btnNext) DOM.btnNext.addEventListener('click', function () { playSong(currentIndex + 1); });
    if (DOM.btnPrev) DOM.btnPrev.addEventListener('click', function () { playSong(currentIndex - 1); });
    if (DOM.btnLoop) {
        DOM.btnLoop.addEventListener('click', function () {
            isLooping = !isLooping;
            if (isLooping) {
                DOM.btnLoop.classList.add('active');
                if (DOM.menuBtnLoop) DOM.menuBtnLoop.classList.add('active');
            } else {
                DOM.btnLoop.classList.remove('active');
                if (DOM.menuBtnLoop) DOM.menuBtnLoop.classList.remove('active');
            }
        });
    }

    if (DOM.seekBar) {
        var startSeeking = function () { if (DOM.progressWrapper) DOM.progressWrapper.classList.add('seeking'); };
        var stopSeeking = function () { if (DOM.progressWrapper) DOM.progressWrapper.classList.remove('seeking'); };

        bindLiveSlider(DOM.seekBar, function (e) {
            updateSeekUI(e.target.value);
            applySeekToAudio(e.target.value);
        });

        DOM.seekBar.addEventListener('pointerdown', startSeeking);
        DOM.seekBar.addEventListener('touchstart', startSeeking);
        DOM.seekBar.addEventListener('mousedown', startSeeking);

        window.addEventListener('pointerup', stopSeeking);
        window.addEventListener('pointercancel', stopSeeking);
        window.addEventListener('touchend', stopSeeking);
        window.addEventListener('mouseup', stopSeeking);
    }

    if (DOM.audio) {
        DOM.audio.addEventListener('loadedmetadata', function () {
            if (pendingSeekPercent !== null) applySeekToAudio(pendingSeekPercent);
            if (isFinite(DOM.audio.duration)) updateSeekUI((DOM.audio.currentTime / DOM.audio.duration) * 100);
            updatePlayback();
            if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function') {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: DOM.audio.duration || 0,
                        position: DOM.audio.currentTime || 0,
                        playbackRate: DOM.audio.playbackRate || 1
                    });
                } catch (e) {}
            }
        });

        DOM.audio.addEventListener('timeupdate', function () {
            if (DOM.progressWrapper && DOM.progressWrapper.classList.contains('seeking')) return;
            if (isFinite(DOM.audio.duration)) updateSeekUI((DOM.audio.currentTime / DOM.audio.duration) * 100);
            if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function') {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: DOM.audio.duration || 0,
                        position: DOM.audio.currentTime || 0,
                        playbackRate: DOM.audio.playbackRate || 1
                    });
                } catch (e) {}
            }
        });

        DOM.audio.addEventListener('ended', function () {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'none';
            }
            if (isLooping) {
                DOM.audio.currentTime = 0;
                safePlay(DOM.audio);
            } else {
                playSong(currentIndex + 1);
            }
        });

        DOM.audio.addEventListener('play', function () {
            initAudioEngine();
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            updatePlayback();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        });

        DOM.audio.addEventListener('pause', function () {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        });
    }

    if (DOM.searchInput) {
        bindLiveSlider(DOM.searchInput, function (e) {
            if (currentPage !== 0 && e.target.value.trim().length > 0 && !isWidgetApp()) goToPage(0);
            var q = e.target.value.toLowerCase();
            currentPlaylist = allSongs.filter(function (s) {
                return s.title.toLowerCase().indexOf(q) !== -1 || s.artist.toLowerCase().indexOf(q) !== -1;
            });
            renderList(currentPlaylist);
        });
    }

    if (DOM.pageContainer) {
        var touchStartX = 0;
        DOM.pageContainer.addEventListener('touchstart', function (e) {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        DOM.pageContainer.addEventListener('touchend', function (e) {
            if (isWidgetApp()) return;
            var touchEndX = e.changedTouches[0].screenX;
            if (touchEndX < touchStartX - 50 && currentPage < totalPages - 1) goToPage(currentPage + 1);
            if (touchEndX > touchStartX + 50 && currentPage > 0) goToPage(currentPage - 1);
        });
    }

    if (DOM.btnBackToSongs) {
        DOM.btnBackToSongs.addEventListener('click', function () {
            renderList(allSongs);
            goToPage(0);
        });
    }

    if (DOM.navLeft) DOM.navLeft.addEventListener('click', function () { if (currentPage > 0) goToPage(currentPage - 1); });
    if (DOM.navRight) DOM.navRight.addEventListener('click', function () { if (currentPage < totalPages - 1) goToPage(currentPage + 1); });

    if (DOM.btnBackToPlaylists) {
        DOM.btnBackToPlaylists.addEventListener('click', function () {
            if (DOM.playlistDetailView) DOM.playlistDetailView.style.display = 'none';
            if (DOM.playlistMainView) DOM.playlistMainView.style.display = 'block';
            renderPlaylists();
        });
    }

    if (DOM.btnPageCreatePlaylist && DOM.pageNewPlaylistInput) {
        DOM.btnPageCreatePlaylist.addEventListener('click', function () {
            var name = DOM.pageNewPlaylistInput.value.trim();
            if (name && !userPlaylists[name]) {
                userPlaylists[name] = [];
                savePlaylists();
                renderPlaylists();
                DOM.pageNewPlaylistInput.value = '';
            }
        });
    }

    if (DOM.btnFavorite) {
        DOM.btnFavorite.addEventListener('click', function () {
            if (currentIndex < 0 || !currentPlaylist[currentIndex]) return;

            var song = currentPlaylist[currentIndex];
            var url = song.url;
            var idx = favoriteUrls.indexOf(url);

            var cards = document.querySelectorAll('.song-card');
            cards.forEach(function (card) {
                if (card.getAttribute('data-url') === url) {
                    var star = card.querySelector('.star-btn');
                    if (star) {
                        if (idx === -1) star.classList.add('fav-active');
                        else star.classList.remove('fav-active');
                    }
                }
            });

            if (idx === -1) {
                favoriteUrls.push(url);
                DOM.btnFavorite.classList.add('fav-active');
                if (DOM.menuBtnFavorite) DOM.menuBtnFavorite.classList.add('fav-active');
            } else {
                favoriteUrls.splice(idx, 1);
                DOM.btnFavorite.classList.remove('fav-active');
                if (DOM.menuBtnFavorite) DOM.menuBtnFavorite.classList.remove('fav-active');
            }

            saveFavorites();
            syncSongOffline(url);

            if (currentPage === 1) renderFavorites();
        });
    }

    if (DOM.btnStop) {
        DOM.btnStop.addEventListener('click', function () {
            DOM.audio.pause();
            DOM.audio.currentTime = 0;

            if (DOM.btnPlayPause)
                DOM.btnPlayPause.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';

            document.querySelector('.mini-player').classList.add('notplaying');

            var bg = document.getElementById('body-bg');
            if (bg) {
                bg.src = "placeholder.png";
                document.documentElement.style.setProperty('--accent', '#00a0ff');
            }
        });
    }

    DOM.btnOverflowMenu.addEventListener('click', function (e) {
        e.stopPropagation();

        if (document.getElementById('contextSongOptions')) document.getElementById('contextSongOptions').style.display = 'none';
        if (document.getElementById('contextPlaylistOptions')) document.getElementById('contextPlaylistOptions').style.display = 'none';

        DOM.contextPlayerOptions.style.display = 'block';

        var rect = DOM.btnOverflowMenu.getBoundingClientRect();

        if (typeof positionContextMenu === 'function') {
            positionContextMenu(rect.left - 80, rect.top - 180);
        }
    });

    DOM.menuBtnLoop.addEventListener('click', function () {
        DOM.btnLoop.click();
        DOM.contextMenu.style.display = 'none';
    });

    DOM.menuBtnEQ.addEventListener('click', function () {
        DOM.btnEQ.click();
        DOM.contextMenu.style.display = 'none';
    });

    DOM.menuBtnStop.addEventListener('click', function () {
        DOM.btnStop.click();
        DOM.contextMenu.style.display = 'none';
    });

    DOM.menuBtnFavorite.addEventListener('click', function () {
        DOM.btnFavorite.click();
        DOM.contextMenu.style.display = 'none';
    });

    document.addEventListener('click', function (e) {
        if (DOM.contextMenu && !DOM.contextMenu.contains(e.target) && !e.target.closest('.song-card') && !e.target.closest('.playlist-card')) {
            DOM.contextMenu.style.display = 'none';
        }
    });

    if (DOM.btnCreatePlaylist && DOM.newPlaylistInput) {
        DOM.btnCreatePlaylist.addEventListener('click', function () {
            var name = DOM.newPlaylistInput.value.trim();
            if (name && !userPlaylists[name]) {
                userPlaylists[name] = activeTargetSong ? [activeTargetSong.url] : [];
                savePlaylists();
                if (activeTargetSong) {
                    syncSongOffline(activeTargetSong.url);
                }
                renderPlaylists();
                DOM.newPlaylistInput.value = '';
                DOM.contextMenu.style.display = 'none';
            }
        });
    }

    if (DOM.btnRenamePlaylist) {
        DOM.btnRenamePlaylist.addEventListener('click', function () {
            if (activeTargetPlaylist) {
                var newName = prompt("Enter new name for playlist:", activeTargetPlaylist);
                if (newName && newName.trim() !== "" && newName !== activeTargetPlaylist) {
                    newName = newName.trim();
                    if (!userPlaylists[newName]) {
                        userPlaylists[newName] = userPlaylists[activeTargetPlaylist];
                        var songsToSync = userPlaylists[activeTargetPlaylist] || [];
                        delete userPlaylists[activeTargetPlaylist];
                        savePlaylists();

                        songsToSync.forEach(function (url) {
                            syncSongOffline(url);
                        });

                        renderPlaylists();
                        DOM.contextMenu.style.display = 'none';
                    } else {
                        alert("A playlist with that name already exists.");
                    }
                }
            }
        });
    }

    if (DOM.btnDeletePlaylist) {
        DOM.btnDeletePlaylist.addEventListener('click', function () {
            if (activeTargetPlaylist) {
                var songsInDeletedPlaylist = userPlaylists[activeTargetPlaylist] || [];
                delete userPlaylists[activeTargetPlaylist];
                savePlaylists();

                songsInDeletedPlaylist.forEach(function (url) {
                    syncSongOffline(url);
                });

                renderPlaylists();
                DOM.contextMenu.style.display = 'none';

                if (
                    DOM.playlistDetailView.style.display === 'block' &&
                    DOM.detailPlaylistTitle.textContent === activeTargetPlaylist
                ) {
                    DOM.playlistDetailView.style.display = 'none';
                    DOM.playlistMainView.style.display = 'block';
                }
            }
        });
    }

    bindLiveSlider(DOM.speedSlider, updatePlayback);
    if (DOM.preservePitch) DOM.preservePitch.addEventListener('change', updatePlayback);

    bindLiveSlider(DOM.drySlider, function (e) { if (dryGain) dryGain.gain.value = e.target.value; });
    bindLiveSlider(DOM.wetSlider, function (e) { if (wetGain) wetGain.gain.value = e.target.value; });

    for (var i = 0; i < 10; i++) {
        (function (index) {
            var slider = document.getElementById('eqSlider' + index);
            bindLiveSlider(slider, function (e) {
                if (filters[index]) filters[index].gain.value = e.target.value;
            });
        })(i);
    }
}

function isOnline() {
    return navigator.onLine;
}

function loadOfflineSongs(callback) {
    if (!offlineDB) { if (callback) callback([]); return; }

    var tx = offlineDB.transaction(['songs'], 'readonly');
    var store = tx.objectStore('songs');
    var req = store.getAll();

    req.onsuccess = function (e) {
        var records = e.target.result || [];
        var songs = records.map(function (r) {
            var blobUrl = '';
            if (r.blob) {
                try {
                    blobUrl = URL.createObjectURL(r.blob);
                } catch (err) {
                    console.error('Blob generation error:', err);
                }
            }
            return {
                title: r.title,
                artist: r.artist,
                url: r.url,
                blobUrl: blobUrl,
                art: r.art
            };
        });

        if (callback) callback(songs);
    };
}

function bootMusic() {
    openOfflineDB(function () {
        if (isOnline()) {
            loadMusic();
        } else {
            loadOfflineSongs(function (songs) {
                allSongs = songs;
                currentPlaylist = allSongs.slice(0);
                renderList(currentPlaylist);
            });
        }
    });
}

(function detectSamsungExperience() {
    var ua = navigator.userAgent;
    var isAndroid = ua.indexOf('Android') !== -1;
    var isSamsungDevice = (ua.indexOf('SAMSUNG') !== -1 || ua.indexOf('Samsung') !== -1 || ua.indexOf('SM-') !== -1);
    if (isAndroid && isSamsungDevice) {
        var match = ua.match(/Android\s([0-9\.]+)/);
        if (match && match[1]) {
            var version = parseFloat(match[1]);
            if (version >= 7.0 && version <= 8.1) {
                if (document.body) {
                    document.body.classList.add('SamsungExperience');
                } else {
                    document.addEventListener('DOMContentLoaded', function () {
                        document.body.classList.add('SamsungExperience');
                    });
                }
            }
        }
    }
})();

(function () {
    var menu = document.getElementById('contextMenu');
    if (!menu) return;

    var backdrop = document.createElement('div');
    backdrop.id = 'contextMenuBackdrop';
    backdrop.className = 'context-menu-backdrop';
    menu.parentNode.insertBefore(backdrop, menu);

    function closeMenuAnimation() {
        menu.classList.remove('show');
        backdrop.classList.remove('show');
    }

    backdrop.addEventListener('click', closeMenuAnimation);
    window.addEventListener('resize', closeMenuAnimation);

    var observer = new MutationObserver(function () {
        if (menu.style.display && menu.style.display !== 'none') {
            menu.style.display = '';
            menu.classList.add('show');
            backdrop.classList.add('show');
        } else if (menu.style.display === 'none') {
            menu.style.display = '';
            closeMenuAnimation();
        }
    });

    observer.observe(menu, { attributes: true, attributeFilter: ['style'] });
})();

(function initWindowsIntegration() {
    if (typeof window.Windows === 'undefined') {
        try { console.info('Windows Runtime not available — skipping UWP integration.'); } catch (e) { }
        return;
    }

    try {
        if (document.body) {
            document.body.classList.add('win-type-body');
        } else {
            document.addEventListener("DOMContentLoaded", function () {
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

    function updateLiveTileFromXml() {
        if (!Notifications) return;
        var url = 'https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml?nocache=' + new Date().getTime();
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onload = function () {
            try {
                var xml = new window.DOMParser().parseFromString(xhr.responseText, 'text/xml');
                var items = xml.getElementsByTagName('song');
                var tileUpdater = Notifications.TileUpdateManager.createTileUpdaterForApplication();
                var tileType = Notifications.TileTemplateType;

                tileUpdater.enableNotificationQueue(true);
                tileUpdater.clear();

                for (var i = 0; i < Math.min(items.length, 5); i++) {
                    var songNode = items[i];
                    var getT = function (tag) {
                        var el = songNode.getElementsByTagName(tag)[0];
                        return el ? el.textContent : '';
                    };

                    var title = getT('title');
                    var artist = getT('artist');
                    var albumArt = getT('albumArt');

                    var wideXml = Notifications.TileUpdateManager.getTemplateContent(tileType.tileWide310x150ImageAndText01);
                    var wideText = wideXml.getElementsByTagName("text");
                    var wideImg = wideXml.getElementsByTagName("image");

                    if (wideText[0]) wideText[0].appendChild(wideXml.createTextNode(title));
                    if (wideText[1]) wideText[1].appendChild(wideXml.createTextNode(artist));
                    if (wideImg[0]) wideImg[0].setAttribute("src", albumArt);

                    var squareXml = Notifications.TileUpdateManager.getTemplateContent(tileType.tileSquare150x150PeekImageAndText02);
                    var squareText = squareXml.getElementsByTagName("text");
                    var squareImg = squareXml.getElementsByTagName("image");

                    if (squareText[0]) squareText[0].appendChild(squareXml.createTextNode(title));
                    if (squareText[1]) squareText[1].appendChild(squareXml.createTextNode(artist));
                    if (squareImg[0]) squareImg[0].setAttribute("src", albumArt);

                    var bindingNode = wideXml.importNode(squareXml.getElementsByTagName("binding").item(0), true);
                    wideXml.getElementsByTagName("visual").item(0).appendChild(bindingNode);

                    tileUpdater.update(new Notifications.TileNotification(wideXml));
                }
            } catch (e) {
                console.warn('Tile update failed:', e);
            }
        };
        xhr.send();
    }

    updateLiveTileFromXml();

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

var availableThemes = [];
var savedTheme = localStorage.getItem('drayTheme');

function applyTheme(stylesheetName, saveToStorage) {
    var themeLink = document.getElementById('theme-stylesheet');
    if (!themeLink) return;

    if (!stylesheetName) {
        themeLink.removeAttribute('href');
        if (saveToStorage) localStorage.removeItem('drayTheme');
    } else {
        themeLink.setAttribute('href', 'themes/' + stylesheetName);
        if (saveToStorage) localStorage.setItem('drayTheme', stylesheetName);
    }
}

function renderThemes() {
    var container = document.getElementById('themeListContainer');
    if (!container) return;

    var html = '<button class="theme-btn ' + (!savedTheme ? 'active-theme' : '') + '" data-sheet="">Default</button>';

    for (var i = 0; i < availableThemes.length; i++) {
        var theme = availableThemes[i];
        var isActive = (savedTheme === theme.stylesheet) ? 'active-theme' : '';
        html += '<button class="theme-btn ' + isActive + '" data-sheet="' + escapeHTML(theme.stylesheet) + '">' + escapeHTML(theme.name) + '</button>';
    }

    container.innerHTML = html;

    var btns = container.querySelectorAll('.theme-btn');
    for (var j = 0; j < btns.length; j++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                var sheet = btn.getAttribute('data-sheet');
                applyTheme(sheet, true);
                savedTheme = sheet; 
                for (var k = 0; k < btns.length; k++) {
                    btns[k].classList.remove('active-theme');
                }
                btn.classList.add('active-theme');
            });
        })(btns[j]);
    }
}

function loadThemes() {
    if (savedTheme) {
        applyTheme(savedTheme, false);
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'themes/themes.xml?nocache=' + new Date().getTime(), true);
    
    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            var xml;
            try {
                xml = new window.DOMParser().parseFromString(xhr.responseText, 'text/xml');
            } catch (e) { 
                console.error('Theme XML Parse Error', e); 
                return; 
            }

            var items = xml.getElementsByTagName('theme');
            availableThemes = [];

            for (var i = 0; i < items.length; i++) {
                var t = items[i];
                var nameEl = t.getElementsByTagName('name')[0];
                var sheetEl = t.getElementsByTagName('stylesheet')[0];
                
                if (nameEl && sheetEl) {
                    availableThemes.push({
                        name: nameEl.textContent,
                        stylesheet: sheetEl.textContent
                    });
                }
            }
            
            renderThemes();
        } else {
            console.warn('Could not load themes.xml. Status:', xhr.status);
            renderThemes();
        }
    };
    
    xhr.onerror = function() { 
        console.warn('Network error loading themes.xml'); 
        renderThemes(); 
    };
    
    xhr.send();
}

loadThemes();
updateNavArrows();
bindEvents();
bootMusic();

function applyDynamicAccent(imageSrc) {
    if (!imageSrc || imageSrc.indexOf('placeholder.png') !== -1) {
        document.documentElement.style.setProperty('--accent', '#00a0ff');
        return;
    }

    var img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.src = imageSrc;

    img.onload = function() {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        try {
            var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var data = imageData.data;
            var r = 0, g = 0, b = 0;
            var count = 0;
            var step = 4 * 10;

            for (var i = 0; i < data.length; i += step) {
                if ((data[i] > 250 && data[i+1] > 250 && data[i+2] > 250) || 
                    (data[i] < 15 && data[i+1] < 15 && data[i+2] < 15)) {
                    continue;
                }
                
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
            }

            if (count > 0) {
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);
                
                document.documentElement.style.setProperty('--accent', 'rgb(' + r + ', ' + g + ', ' + b + ')');
            } else {
                document.documentElement.style.setProperty('--accent', '#00a0ff');
            }
        } catch (e) {
            console.warn("CORS prevented color extraction. Using default accent.");
            document.documentElement.style.setProperty('--accent', '#00a0ff');
        }
    };
}

var noVfxToggle = document.getElementById('noVfxToggle');
var savedNoVfx = localStorage.getItem('drayNoVfx') === 'true';

if (savedNoVfx) {
    document.body.classList.add('novfx');
}

if (noVfxToggle) {
    noVfxToggle.checked = savedNoVfx;
    noVfxToggle.addEventListener('change', function () {
        if (noVfxToggle.checked) {
            document.body.classList.add('novfx');
        } else {
            document.body.classList.remove('novfx');
        }
        localStorage.setItem('drayNoVfx', noVfxToggle.checked ? 'true' : 'false');
    });
}