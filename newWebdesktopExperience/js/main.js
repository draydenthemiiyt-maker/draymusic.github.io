// © DraydenYT 2026

var systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

function updateSystemThemeClass(event) {
    var isDark = event.matches;
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
}

updateSystemThemeClass(systemThemeQuery);
if (systemThemeQuery.addEventListener) {
    systemThemeQuery.addEventListener('change', updateSystemThemeClass);
} else if (systemThemeQuery.addListener) {
    systemThemeQuery.addListener(updateSystemThemeClass);
}

var DOM = {
    audio: document.getElementById('audioElement'),
    songList: document.getElementById('songList'),
    searchInput: document.getElementById('searchInput'),
    seekBar: document.getElementById('seekBar'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    btnNext: document.getElementById('btnNext'),
    btnPrev: document.getElementById('btnPrev'),
    btnLoop: document.getElementById('btnLoop'),
    currentTitle: document.getElementById('currentTitle'),
    currentArtist: document.getElementById('currentArtist'),
    currentArt: document.getElementById('currentArt'),
    favoritesContainer: document.getElementById('favoritesContainer'),
    pageContainer: document.getElementById('pageContainer'),
    appLayout: document.querySelector('.app-layout'),
    sidebarToggle: document.getElementById('sidebarToggle'),
    btnFavorite: document.getElementById('btnFavorite')
};

window.audio = DOM.audio;

var allSongs = [];
var currentPlaylist = [];
var currentIndex = -1;
var playbackRequested = false;
var isLooping = false;
var pendingSeekPercent = null;
var mediaSessionHandlersRegistered = false;
var trackSourceChanging = false;
var trackSourceChangeId = 0;
var artworkRequestId = 0;
var nextAudioPreloader = null;
var nextAudioPreloadUrl = '';
var nextArtworkPreloader = null;
var nextArtworkPreloadUrl = '';
var currentPage = 0;
var pageTransitionTimeout = null;
var favoriteUrls = JSON.parse(localStorage.getItem('drayFavorites') || '[]');

var windowApi = window.api; // used for Discord rich presence

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

function restoreSidebarState() {
    if (!DOM.appLayout) return;
    var isSmallScreen = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    var isCollapsed = isSmallScreen || localStorage.getItem('draySidebarCollapsed') === 'true';
    DOM.appLayout.classList.toggle('sidebar-collapsed', isCollapsed);
    if (DOM.sidebarToggle) {
        DOM.sidebarToggle.hidden = !!isSmallScreen;
        var label = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
        DOM.sidebarToggle.setAttribute('aria-label', label);
        DOM.sidebarToggle.title = label;
        var icon = DOM.sidebarToggle.querySelector('.material-symbols-rounded');
        if (icon) icon.textContent = isCollapsed ? 'left_panel_open' : 'left_panel_close';
    }
}

function restoreLastPlayedSong() {
    var lastUrl = localStorage.getItem('drayLastSongUrl');
    if (!lastUrl) return;
    for (var i = 0; i < currentPlaylist.length; i++) {
        if (currentPlaylist[i].url === lastUrl) {
            playSong(i, false);
            return;
        }
    }
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

function updatePlayPauseButtons() {
    var iconName = DOM.audio && !DOM.audio.paused ? 'pause' : 'play_arrow';
    var iconHTML = '<span class="material-symbols-rounded">' + iconName + '</span>';
    if (DOM.btnPlayPause) DOM.btnPlayPause.innerHTML = iconHTML;
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
                { src: song.art || 'assets/icon.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        if (mediaSessionHandlersRegistered) return;
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
            updatePlayPauseButtons();
        });
        mediaSessionHandlersRegistered = true;
    }
}

function updateTrackArtwork(song) {
    var requestId = ++artworkRequestId;
    var fallbackArt = 'assets/icon.png';
    var artworkElements = [DOM.currentArt].filter(Boolean);

    for (var i = 0; i < artworkElements.length; i++) {
        artworkElements[i].src = fallbackArt;
        artworkElements[i].classList.add('art-loading');
    }
    applyDynamicAccent(fallbackArt);

    var artUrl = song.art || fallbackArt;
    if (artUrl === 'placeholder.png' || artUrl === fallbackArt) {
        for (var j = 0; j < artworkElements.length; j++) artworkElements[j].classList.remove('art-loading');
        return;
    }

    var image = new Image();
    image.onload = function () {
        if (requestId !== artworkRequestId) return;
        for (var j = 0; j < artworkElements.length; j++) {
            artworkElements[j].src = artUrl;
            artworkElements[j].classList.remove('art-loading');
        }
        applyDynamicAccent(artUrl);
    };
    image.onerror = function () {
        if (requestId !== artworkRequestId) return;
        for (var j = 0; j < artworkElements.length; j++) artworkElements[j].classList.remove('art-loading');
    };
    image.src = artUrl;
}

function preloadNextQueueItem() {
    var nextSong = currentPlaylist.length > 1 && currentIndex >= 0
        ? currentPlaylist[(currentIndex + 1) % currentPlaylist.length]
        : null;

    if (!nextSong) {
        if (nextAudioPreloader) {
            nextAudioPreloader.pause();
            nextAudioPreloader.removeAttribute('src');
            nextAudioPreloader.load();
            nextAudioPreloader = null;
        }
        nextAudioPreloadUrl = '';
        nextArtworkPreloader = null;
        nextArtworkPreloadUrl = '';
        return;
    }

    var audioUrl = nextSong.url;
    if (audioUrl && audioUrl !== nextAudioPreloadUrl) {
        if (nextAudioPreloader) {
            nextAudioPreloader.pause();
            nextAudioPreloader.removeAttribute('src');
            nextAudioPreloader.load();
        }
        nextAudioPreloader = document.createElement('audio');
        nextAudioPreloader.preload = 'auto';
        nextAudioPreloader.src = audioUrl;
        nextAudioPreloader.load();
        nextAudioPreloadUrl = audioUrl;
    }

    if (nextSong.art && nextSong.art !== nextArtworkPreloadUrl) {
        nextArtworkPreloader = new Image();
        nextArtworkPreloader.src = nextSong.art;
        nextArtworkPreloadUrl = nextSong.art;
    }
}

function playSong(index, shouldPlay) {
    if (!DOM.audio || currentPlaylist.length === 0) return;

    currentIndex = (index + currentPlaylist.length) % currentPlaylist.length;
    var song = currentPlaylist[currentIndex];
    if (!song || !song.url) return;
    playbackRequested = shouldPlay !== false;
    localStorage.setItem('drayLastSongUrl', song.url);
    if (DOM.btnFavorite) DOM.btnFavorite.disabled = false;

    trackSourceChanging = true;
    var sourceChangeId = ++trackSourceChangeId;
    setTimeout(function () {
        if (sourceChangeId === trackSourceChangeId) trackSourceChanging = false;
    }, 1500);
    DOM.audio.src = song.url;
    if (shouldPlay !== false) safePlay(DOM.audio);

    if (DOM.currentTitle) DOM.currentTitle.textContent = song.title;
    if (DOM.currentArtist) DOM.currentArtist.textContent = song.artist;
    updateTrackArtwork(song);
    var playPauseIcon = shouldPlay === false ? 'play_arrow' : 'pause';
    if (DOM.btnPlayPause) DOM.btnPlayPause.innerHTML = '<span class="material-symbols-rounded">' + playPauseIcon + '</span>';
    if (DOM.btnFavorite) {
        if (favoriteUrls.indexOf(song.url) !== -1) {
            DOM.btnFavorite.classList.add('fav-active');
        } else {
            DOM.btnFavorite.classList.remove('fav-active');
        }
    }

    updateMediaSession(song);
    syncDiscordRPC();
    if (shouldPlay === false && 'mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
    }
    if (window.audio !== DOM.audio) window.audio = DOM.audio;
    preloadNextQueueItem();
}

var songCardObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        } else {
            entry.target.classList.remove('visible');
        }
    });
}, { threshold: 0.1 });

function compareAlphabetically(first, second) {
    return String(first || '').localeCompare(String(second || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function sortSongsByTitle(songs) {
    return songs.sort(function (first, second) {
        return compareAlphabetically(first.title, second.title);
    });
}

function loadMusic() {
    var url = 'https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml';
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
                    art: getT('albumArt') || 'assets/icon.png',
                    copyrighted: getT('copyrighted').trim().toLowerCase()
                });
            }

            currentPlaylist = allSongs.slice(0);
            renderList(currentPlaylist);
            restoreLastPlayedSong();
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

    sortSongsByTitle(data);
    var html = '';
    for (var i = 0; i < data.length; i++) {
        var song = data[i];
        var isFav = (favoriteUrls.indexOf(song.url) !== -1);
        var starClass = isFav ? 'star-btn fav-active' : 'star-btn';

        html += '<div class="song-card" data-index="' + i + '" data-url="' + escapeHTML(song.url) + '">' +
            '<img src="' + escapeHTML(song.art) + '" alt="art">' +
            '<div class="info" style="flex:1;">' +
            '<h4>' + escapeHTML(song.title) + '</h4>' +
            '<p>' + escapeHTML(song.artist) + '</p>' +
            '</div>' +
            '</div>';
    }
    container.innerHTML = html;

var cards = container.querySelectorAll('.song-card');
for (var c = 0; c < cards.length; c++) {
    songCardObserver.observe(cards[c]);
        (function (card, idx) {
            card.addEventListener('click', function (e) {
                if (e.target.closest && e.target.closest('button')) return;
                currentPlaylist = data.slice(0);
                playSong(idx);
            });

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

function updateSidebarSelection(index) {
    var navLinks = document.querySelectorAll('.sidebar-link');
    for (var i = 0; i < navLinks.length; i++) {
        var isActive = Number(navLinks[i].getAttribute('data-page')) === index;
        navLinks[i].classList.toggle('active', isActive);
        if (isActive) navLinks[i].setAttribute('aria-current', 'page');
        else navLinks[i].removeAttribute('aria-current');
    }
}

function goToPage(index) {
    var pages = DOM.pageContainer ? DOM.pageContainer.querySelectorAll('.page') : [];
    if (index < 0 || index >= pages.length) return false;
    var nextPage = pages[index];
    if (!nextPage || nextPage.classList.contains('active')) return false;
    if (pageTransitionTimeout !== null) return false;

    var currentActivePage = DOM.pageContainer.querySelector('.page.active');
    for (var i = 0; i < pages.length; i++) {
        pages[i].classList.remove('leaving');
    }

    if (currentActivePage && currentActivePage !== nextPage) {
        currentActivePage.classList.remove('active');
        currentActivePage.classList.add('leaving');
        pageTransitionTimeout = setTimeout(function () {
            currentActivePage.classList.remove('leaving');
            pageTransitionTimeout = null;
        }, 180);
    }
    nextPage.classList.add('active');
    requestAnimationFrame(function () { nextPage.scrollTop = 0; });
    currentPage = index;

    updateSidebarSelection(index);
    if (index === 1) renderFavorites();
    return true;
}

function syncDiscordRPC() {
    if (windowApi && windowApi.updateDiscordRPC && currentIndex >= 0 && currentPlaylist.length > 0) {
        var currentSong = currentPlaylist[currentIndex];
        if (currentSong) {
            windowApi.updateDiscordRPC({
                title: currentSong.title,
                artist: currentSong.artist,
                duration: DOM.audio.duration || 0,
                currentTime: DOM.audio.currentTime || 0,
                playing: playbackRequested,
                art: currentSong.art
            });
        }
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
            } else {
                DOM.btnLoop.classList.remove('active');
            }
        });
    }

    if (DOM.seekBar) {
        var startSeeking = function () { if (DOM.progressWrapper) DOM.progressWrapper.classList.add('seeking'); };
        var stopSeeking = function () { if (DOM.progressWrapper) DOM.progressWrapper.classList.remove('seeking'); };

        syncDiscordRPC();
        
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
            trackSourceChanging = false;
            trackSourceChangeId++;
            if (pendingSeekPercent !== null) applySeekToAudio(pendingSeekPercent);
            if (isFinite(DOM.audio.duration)) updateSeekUI((DOM.audio.currentTime / DOM.audio.duration) * 100);
            syncDiscordRPC();
            if ('mediaSession' in navigator && !DOM.audio.paused) {
                navigator.mediaSession.playbackState = 'playing';
            }
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
            if (isLooping) {
                DOM.audio.currentTime = 0;
                safePlay(DOM.audio);
            } else {
                playSong(currentIndex + 1);
            }
        });

        DOM.audio.addEventListener('play', function () {
            playbackRequested = true;
            trackSourceChanging = false;
            trackSourceChangeId++;
            updatePlayPauseButtons();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            syncDiscordRPC();
        });

        DOM.audio.addEventListener('pause', function () {
            if (trackSourceChanging) return;
            playbackRequested = false;
            updatePlayPauseButtons();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            syncDiscordRPC();
        });

        DOM.audio.addEventListener('error', function () {
            trackSourceChanging = false;
            trackSourceChangeId++;
        });
    }

    if (DOM.searchInput) {
        bindLiveSlider(DOM.searchInput, function (e) {
            if (currentPage !== 0 && e.target.value.trim().length > 0) goToPage(0);
            var q = e.target.value.toLowerCase();
            var searchResults = allSongs.filter(function (s) {
                return s.title.toLowerCase().indexOf(q) !== -1 || s.artist.toLowerCase().indexOf(q) !== -1;
            });
            renderList(searchResults);
        });
    }

    var navLinks = document.querySelectorAll('.sidebar-link');
    for (var i = 0; i < navLinks.length; i++) {
        navLinks[i].addEventListener('click', function () {
            goToPage(Number(this.getAttribute('data-page')));
        });
    }

    if (DOM.sidebarToggle && DOM.appLayout) {
        DOM.sidebarToggle.addEventListener('click', function () {
            if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
                restoreSidebarState();
                return;
            }
            var isCollapsed = DOM.appLayout.classList.toggle('sidebar-collapsed');
            var icon = DOM.sidebarToggle.querySelector('.material-symbols-rounded');
            var label = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
            DOM.sidebarToggle.setAttribute('aria-label', label);
            DOM.sidebarToggle.title = label;
            if (icon) icon.textContent = isCollapsed ? 'left_panel_open' : 'left_panel_close';
            localStorage.setItem('draySidebarCollapsed', String(isCollapsed));
        });
        window.addEventListener('resize', restoreSidebarState);
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
            } else {
                favoriteUrls.splice(idx, 1);
                DOM.btnFavorite.classList.remove('fav-active');
            }

            saveFavorites();

            if (currentPage === 1) renderFavorites();
        });
    }

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

restoreSidebarState();
goToPage(0);
bindEvents();
loadMusic();

// Clean up data left behind by the removed audio-settings and offline features
try { localStorage.removeItem('drayAudioSettings'); } catch (e) {}
try { if (window.indexedDB) window.indexedDB.deleteDatabase('DrayMusicOffline'); } catch (e) {}

function applyDynamicAccent(imageSrc) {
    if (!imageSrc || imageSrc.indexOf('assets/icon.png') !== -1) {
        document.documentElement.style.setProperty('--song-accent', '#00a0ff');
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
                
                document.documentElement.style.setProperty('--song-accent', 'rgb(' + r + ', ' + g + ', ' + b + ')');
            } else {
                document.documentElement.style.setProperty('--song-accent', '#00a0ff');
            }
        } catch (e) {
            console.warn("CORS prevented color extraction. Using default accent.");
            document.documentElement.style.setProperty('--song-accent', '#00a0ff');
        }
    };
}