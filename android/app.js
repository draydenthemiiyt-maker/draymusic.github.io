const audio = document.getElementById('audioElement');
const songListContainer = document.getElementById('songList');
const searchInput = document.getElementById('searchInput');
const seekBar = document.getElementById('seekBar');
const progressFill = document.getElementById('progressFill');
const timeTooltip = document.getElementById('timeTooltip');
const progressWrapper = document.querySelector('.progress-wrapper');

let allSongs = [];
let currentPlaylist = [];
let currentIndex = -1;
let isLooping = false;

// --- 1. ANDROID TOUCH/SEEK LOGIC ---
// Forces the bar to expand and stay expanded during touch manipulation
seekBar.addEventListener('touchstart', () => progressWrapper.classList.add('seeking'));
seekBar.addEventListener('mousedown', () => progressWrapper.classList.add('seeking'));

// Global listeners ensure the bar shrinks even if the finger leaves the hit area
window.addEventListener('touchend', () => {
    progressWrapper.classList.remove('seeking');
    timeTooltip.style.display = 'none';
});
window.addEventListener('mouseup', () => {
    progressWrapper.classList.remove('seeking');
    timeTooltip.style.display = 'none';
});

seekBar.oninput = () => {
    if (!audio.duration) return;

    // 1. Calculate the new time
    const seekTo = (seekBar.value / 100) * audio.duration;

    // 2. Set the audio time
    audio.currentTime = seekTo;

    // 3. FORCE the line/fill to follow the finger immediately
    const pct = seekBar.value + "%";
    progressFill.style.width = pct;

    // 4. Update tooltip if you are using one
    if (timeTooltip) {
        timeTooltip.innerText = formatTime(seekTo);
        timeTooltip.style.left = pct;
        timeTooltip.style.display = 'block';
    }
};

// --- 2. MUSIC LOADING ---
async function loadMusic() {
    try {
        // Fetching from GitHub with a timestamp to bypass Android's aggressive caching
        const response = await fetch('https://draydenthemiiyt-maker.github.io/draymusic.github.io/music.xml?nocache=' + Date.now());
        const text = await response.text();
        const xml = new DOMParser().parseFromString(text, 'text/xml');
        const items = xml.getElementsByTagName('song');

        // 1. Map the XML data to our array
        allSongs = Array.from(items).map(s => ({
            title: s.getElementsByTagName('title')[0].textContent,
            artist: s.getElementsByTagName('artist')[0].textContent,
            url: s.getElementsByTagName('url')[0].textContent,
            art: s.getElementsByTagName('albumArt')[0].textContent || 'placeholder.png'
        }));

        // 2. SHUFFLE LOGIC: Randomize the order of allSongs
        for (let i = allSongs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allSongs[i], allSongs[j]] = [allSongs[j], allSongs[i]];
        }

        // 3. Set the playlist and update the UI
        currentPlaylist = allSongs;
        renderList(currentPlaylist);

    } catch (e) {
        console.error("Music load failed. Check Android Internet Permissions:", e);
    }
}

function renderList(data) {
    songListContainer.innerHTML = data.map((song, index) => `
        <div class="song-card" onclick="playSong(${index})" style="animation-delay: ${index * 0.05}s">
            <img src="${song.art}">
            <div class="info">
                <h4>${song.title}</h4>
                <p>${song.artist}</p>
            </div>
        </div>
    `).join('');
}

// --- 3. PLAYER CONTROLS ---
function playSong(index) {
    if (currentPlaylist.length === 0) return;

    currentIndex = (index + currentPlaylist.length) % currentPlaylist.length;
    const song = currentPlaylist[currentIndex];

    audio.src = song.url;
    audio.play();

    // --- NATIVE ANDROID NOTIFICATION ---
    if (typeof android !== 'undefined' && android.notification) {
        android.notification.playback({
            title: song.title,
            artist: song.artist,
            image: song.art,
            playing: true,
            // These IDs link back to your play/next/prev logic
            onPlayPause: "togglePlay()",
            onNext: "playNext()",
            onPrevious: "playPrev()"
        });
    }

    // Keep the MediaSession for redundancy
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title,
            artist: song.artist,
            artwork: [{ src: song.art, sizes: '512x512', type: 'image/png' }]
        });
    }

    // Update Player UI
    document.getElementById('currentTitle').innerText = song.title;
    document.getElementById('currentArtist').innerText = song.artist;
    document.getElementById('currentArt').src = song.art;
    document.getElementById('btnPlayPause').innerHTML = '<span class="material-symbols-rounded">pause</span>';
}

// Function for Android to call when lock-screen buttons are pressed
function togglePlay() {
    const btn = document.getElementById('btnPlayPause');
    if (audio.paused) {
        audio.play();
        btn.innerHTML = '<span class="material-symbols-rounded">pause</span>';
        updateAndroidPlayback(true);
    } else {
        audio.pause();
        btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        updateAndroidPlayback(false);
    }
}

function playNext() { playSong(currentIndex + 1); }
function playPrev() { playSong(currentIndex - 1); }

// Keep the system notification in sync with the state
function updateAndroidPlayback(isPlaying) {
    if (typeof android !== 'undefined' && android.notification) {
        const song = currentPlaylist[currentIndex];
        android.notification.playback({
            title: song.title,
            artist: song.artist,
            image: song.art,
            playing: isPlaying
        });
    }
}

audio.ontimeupdate = () => {
    // Only update the bar if the user isn't currently touching/seeking it
    if (audio.duration && !progressWrapper.classList.contains('seeking')) {
        const pct = (audio.currentTime / audio.duration) * 100;
        seekBar.value = pct;
        progressFill.style.width = pct + "%";
    }
};

document.getElementById('btnPlayPause').onclick = () => {
    const btn = document.getElementById('btnPlayPause');
    if (audio.paused) {
        audio.play();
        btn.innerHTML = '<span class="material-symbols-rounded">pause</span>';
    } else {
        audio.pause();
        btn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
    }
};

document.getElementById('btnNext').onclick = () => playSong(currentIndex + 1);
document.getElementById('btnPrev').onclick = () => playSong(currentIndex - 1);

document.getElementById('btnLoop').onclick = () => {
    isLooping = !isLooping;
    document.getElementById('btnLoop').classList.toggle('active', isLooping);
};

audio.onended = () => {
    if (isLooping) {
        audio.currentTime = 0;
        audio.play();
    } else {
        playSong(currentIndex + 1);
    }
};

searchInput.oninput = () => {
    const q = searchInput.value.toLowerCase();
    currentPlaylist = allSongs.filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q)
    );
    renderList(currentPlaylist);
};

// Initialize
loadMusic();
