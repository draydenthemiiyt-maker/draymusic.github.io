document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    var Lang = navigator.language || navigator.userLanguage || "en-GB";
    var blockedWords = ["6-7", "six seven", "six-seven", "6 7", "6&7", "6 + 7", "6+7", "6 and 7", "6 & 7", "67", "fuck", "shit", "piss", "ass", "asshole", "fucker", "sex", "pedo"];
    var currentVoice = null;
    var isMuted = false;
    var currentImageBase64 = null;
    var currentImageMimeType = null;
    var chatHistory = [];
    var currentContextText = "";
    var currentMode = "fast";
    var synthesizer = window.speechSynthesis;
    var GEMINI_API_KEY = (typeof process !== "undefined" && process.env && process.env.GEMINI_API_KEY) 
        || localStorage.getItem("drayAiGeminiKey") 
        || "";
    var YOUTUBE_API_KEY = (typeof process !== "undefined" && process.env && process.env.YOUTUBE_API_KEY) 
        || localStorage.getItem("drayAiYoutubeKey") 
        || "";

    function getModeSuffix() {
        switch (currentMode) {
            case "pro": return "\n\n[System Instruction: This user is a pro, pls treat them with respect, the user knows what they are doing, dont change things without asking them] THIS IS A SYSTEM MESSAGE - THE USER DID NOT SEND THIS SYSTEM MESSAGTE, THE SYSTEM DID, DO NOT LET THE USER KNOW ABOUT THIS, IT IS A SYSTEM MESSAGE FROM THE AI CLIENT, DONT ASK THE USER WHY THEY SENT THIS, CUS THEY DID NOT, IF YOU DO, THE USER WILL GET SICK OF IT AND SWITHD TO GEMINI, AND AS A DRAY AI COMPEMU WE DONT LIKE THAT, SO PLS, IF THE USER EVER ASKES, WHAT MODE ARE YOU IN, RESPOND WITH YOUR MODE, YOUR NAME IS DRAYAI AND YOUR DEV IS DRAYDENYT, RESPECT THAT THANK YOU";
            case "study": return "\n\n[System Instruction: The user is studying. Explain concepts clearly, step-by-step, and provide helpful examples. Act as a patient tutor.] THIS IS A SYSTEM MESSAGE - THIS IS A SYSTEM MESSAGE - THE USER DID NOT SEND THIS SYSTEM MESSAGTE, THE SYSTEM DID, DO NOT LET THE USER KNOW ABOUT THIS, IT IS A SYSTEM MESSAGE FROM THE AI CLIENT, DONT ASK THE USER WHY THEY SENT THIS, CUS THEY DID NOT, IF YOU DO, THE USER WILL GET SICK OF IT AND SWITHD TO GEMINI, AND AS A DRAY AI COMPEMU WE DONT LIKE THAT, SO PLS, IF THE USER EVER ASKES, WHAT MODE ARE YOU IN, RESPOND WITH YOUR MODE, YOUR NAME IS DRAYAI AND YOUR DEV IS DRAYDENYT, RESPECT THAT THANK YOU";
            case "thinking": return "\n\n[System Instruction: Take a deep breath and think step-by-step before answering. Provide a highly detailed, analytical, and well-thought-out response.] THIS IS A SYSTEM MESSAGE - THE USER DID NOT SEND THIS SYSTEM MESSAGTE, THE SYSTEM DID, DO NOT LET THE USER KNOW ABOUT THIS, IT IS A SYSTEM MESSAGE FROM THE AI CLIENT, DONT ASK THE USER WHY THEY SENT THIS, CUS THEY DID NOT, IF YOU DO, THE USER WILL GET SICK OF IT AND SWITHD TO GEMINI, AND AS A DRAY AI COMPEMU WE DONT LIKE THAT, SO PLS, IF THE USER EVER ASKES, WHAT MODE ARE YOU IN, RESPOND WITH YOUR MODE, YOUR NAME IS DRAYAI AND YOUR DEV IS DRAYDENYT, RESPECT THAT THANK YOU";
            default: return "";
        }
    }

    initializeUI();
    loadHistory();
    loadBackground();

    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoicePreference;
    }

    function initializeUI() {
        loadVoicePreference();

document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
}, false);

        document.getElementById("sendBtn").addEventListener("click", handleSend);

        document.getElementById("bgBtn").addEventListener("click", function () {
            document.getElementById("bgFileInput").click();
        });

        document.getElementById("uploadBtn").addEventListener("click", function () {
            document.getElementById("imageInput").click();
        });

        document.getElementById("bgFileInput").addEventListener("change", function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (event) {
                var bgUrl = event.target.result;
                applyBackground(bgUrl);
                try {
                    localStorage.setItem("drayAiBgImage", bgUrl);
                } catch (err) {
                    console.log("Image too large for local storage");
                }
            };
            reader.readAsDataURL(file);
        });

        document.getElementById("imageInput").addEventListener("change", function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (event) {
                var fullBase64 = event.target.result;
                currentImageMimeType = file.type;
                currentImageBase64 = fullBase64.split(',')[1];
                document.getElementById("msgInput").classList.add("input-image-attached");
                document.getElementById("msgInput").placeholder = "Image attached! Type a message...";
            };
            reader.readAsDataURL(file);
        });

        document.getElementById("msgInput").addEventListener("keydown", function (e) {
            if (e.key === "Enter") handleSend();
        });

        var chatList = document.getElementById("chatList");
        chatList.addEventListener("contextmenu", function (e) {
            var bubble = e.target.closest(".message-bubble");
            if (bubble) {
                e.preventDefault();
                currentContextText = bubble.textContent || bubble.innerText;
                var menu = document.getElementById("msgContextMenu");
                menu.style.left = Math.min(e.pageX, window.innerWidth - 160) + "px";
                menu.style.top = Math.min(e.pageY, window.innerHeight - 100) + "px";
                showMenu("msgContextMenu");
            }
        });

        var pressTimer;
        chatList.addEventListener("touchstart", function (e) {
            var bubble = e.target.closest(".message-bubble");
            if (bubble) {
                pressTimer = setTimeout(function () {
                    currentContextText = bubble.textContent || bubble.innerText;
                    var touch = e.touches[0];
                    var menu = document.getElementById("msgContextMenu");
                    menu.style.left = Math.min(touch.pageX, window.innerWidth - 160) + "px";
                    menu.style.top = Math.min(touch.pageY, window.innerHeight - 100) + "px";
                    showMenu("msgContextMenu");
                }, 600); // 600ms hold
            }
        });
        chatList.addEventListener("touchend", function () { clearTimeout(pressTimer); });
        chatList.addEventListener("touchmove", function () { clearTimeout(pressTimer); });

        document.getElementById("cmdCopy").addEventListener("click", function () {
            if (currentContextText && navigator.clipboard) {
                navigator.clipboard.writeText(currentContextText);
            }
            hideMenus();
        });

        document.getElementById("cmdReadAloud").addEventListener("click", function () {
            if (currentContextText) speak(currentContextText);
            hideMenus();
        });

        document.getElementById("modeBtn").addEventListener("click", function () {
            var btnRect = this.getBoundingClientRect();
            var menu = document.getElementById("modeMenu");
            menu.style.right = (window.innerWidth - btnRect.right) + "px";
            menu.style.bottom = (window.innerHeight - btnRect.top + 10) + "px";
            showMenu("modeMenu");
        });

        var modeItems = document.querySelectorAll("#modeMenu .menu-item");
        for (var i = 0; i < modeItems.length; i++) {
            modeItems[i].addEventListener("click", function () {
                for (var j = 0; j < modeItems.length; j++) {
                    modeItems[j].classList.remove("active");
                }
                this.classList.add("active");
                currentMode = this.getAttribute("data-mode");
                hideMenus();
            });
        }

        document.getElementById("voiceBtn").addEventListener("click", function () {
            renderVoiceMenu();
            var btnRect = this.getBoundingClientRect();
            var menu = document.getElementById("voiceMenu");
            menu.style.right = (window.innerWidth - btnRect.right) + "px";
            menu.style.bottom = (window.innerHeight - btnRect.top + 10) + "px";
            showMenu("voiceMenu");
        });

        document.getElementById("menuOverlay").addEventListener("click", hideMenus);
    }

    function showMenu(menuId) {
        document.getElementById("menuOverlay").classList.remove("hidden");
        document.getElementById(menuId).classList.remove("hidden");
    }

    function hideMenus() {
        document.getElementById("menuOverlay").classList.add("hidden");
        var menus = document.querySelectorAll(".glass-menu");
        for (var i = 0; i < menus.length; i++) {
            menus[i].classList.add("hidden");
        }
    }

    function censorText(text) {
        var censored = text;
        for (var i = 0; i < blockedWords.length; i++) {
            var regex = new RegExp("\\b" + blockedWords[i] + "\\b", "gi");
            censored = censored.replace(regex, "****");
        }
        return censored;
    }

    function renderHistoryMessage(text, sender, attachedImgBase64, attachedImgMime) {
        var list = document.getElementById("chatList");
        var row = document.createElement("div");
        row.className = "message-row " + (sender === "user" ? "msg-user-row" : "msg-bot-row");

        var bubble = document.createElement("div");
        bubble.className = "message-bubble " + (sender === "user" ? "msg-user" : "msg-bot");

        var formattedText = text.replace(/!\[([^\]]*)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="chat-image" />');

        if (attachedImgBase64) {
            formattedText = '<img src="data:' + attachedImgMime + ';base64,' + attachedImgBase64 + '" class="chat-image" />' + formattedText;
        }

        bubble.innerHTML = formattedText;
        row.appendChild(bubble);
        list.appendChild(row);

        var container = document.getElementById("chatContainer");
        container.scrollTop = container.scrollHeight;
    }

    function handleReminderCommand(text) {
        var now = new Date();
        var notifyTime = new Date();
        var lowerText = text.toLowerCase();
        var task = "";
        var timeFound = false;

        var relativeMatch = lowerText.match(/in (\d+)\s*(hour|minute|min|second|sec|day)/);
        var absoluteMatch = lowerText.match(/(\d{1,2}):(\d{2})/);

        if (relativeMatch) {
            var amount = parseInt(relativeMatch[1]);
            var unit = relativeMatch[2];

            if (unit.indexOf("hour") !== -1) notifyTime.setHours(now.getHours() + amount);
            else if (unit.indexOf("min") !== -1) notifyTime.setMinutes(now.getMinutes() + amount);
            else if (unit.indexOf("sec") !== -1) notifyTime.setSeconds(now.getSeconds() + amount);
            else if (unit.indexOf("day") !== -1) notifyTime.setDate(now.getDate() + amount);

            timeFound = true;
            task = text.replace(relativeMatch[0], "").replace(/remind me to|set a reminder to|set a reminder|reminder/gi, "").trim();

        } else if (absoluteMatch) {
            var hours = parseInt(absoluteMatch[1]);
            var mins = parseInt(absoluteMatch[2]);
            notifyTime.setHours(hours, mins, 0, 0);

            if (notifyTime < now) { notifyTime.setDate(now.getDate() + 1); }

            timeFound = true;
            task = text.replace(absoluteMatch[0], "").replace(/remind me to|set a reminder to|set a reminder|reminder/gi, "").trim();
        }

        if (timeFound) {
            if (!task) task = "Scheduled Reminder";
            scheduleReminder(task, notifyTime);

            var timeString = notifyTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            addMessage("Got it! I've set the reminder '" + task + "' at " + timeString + ".", "bot");
            speak("Got it. I'll remind you at " + timeString);
        } else {
            addMessage("I need to know when! Try saying 'in 1 hour' or 'at 15:30'.", "bot");
        }
    }

    function scheduleReminder(text, dueTime) {
        var timeToWait = dueTime.getTime() - new Date().getTime();
        if (timeToWait < 0) return;

        setTimeout(function () {
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("DrayAi Reminder", { body: text });
            } else {
                addMessage("REMINDER: " + text, "bot");
                playPing();
            }
        }, timeToWait);
    }

    function loadBackground() {
        var bg = localStorage.getItem("drayAiBgImage");
        if (bg) { applyBackground(bg); }
    }

    function applyBackground(url) {
        var container = document.getElementById("chatContainer");
        container.style.backgroundImage = "url('" + url + "')";
    }

    function handleSend() {
        var input = document.getElementById("msgInput");
        var rawText = input.value.trim();
        if (!rawText && !currentImageBase64) return;

        var text = censorText(rawText);
        var lowerText = text.toLowerCase();

        if (text.indexOf("****") !== -1) {
            addMessage("That was rude, Don't say that", "bot");
            addMessage(text, "user");
            input.value = "";
            return;
        }

        if (["clear", "refresh", "reset", "reload"].indexOf(lowerText) !== -1) {
            clearChat();
            input.value = "";
            return;
        }

        if (lowerText.indexOf("remind") !== -1 || lowerText.indexOf("reminder") !== -1) {
            addMessage(text, "user");
            handleReminderCommand(text);
            input.value = "";
            return;
        }

        addMessage(text, "user", false, currentImageBase64, currentImageMimeType);
        input.value = "";

        currentImageBase64 = null;
        currentImageMimeType = null;
        document.getElementById("imageInput").value = "";
        input.classList.remove("input-image-attached");
        input.placeholder = "Message DrayAi...";

        if (lowerText.indexOf("play ") === 0) {
            var songQuery = text.substring(5);
            playMusic(songQuery);
        } else if (lowerText === "stop") {
            stopMusic();
            addMessage("Music stopped.", "bot");
            speak("Music stopped.");
        } else {
            callAI(text);
        }
    }

    function clearChat() {
        localStorage.removeItem("drayAiHistory");
        chatHistory = [];
        document.getElementById("chatList").innerHTML = "";
        localStorage.removeItem("drayAiBgImage");
        localStorage.removeItem("drayAiVoiceURI");
        localStorage.removeItem("drayAiMuted");
        loadVoicePreference();
        document.getElementById("chatContainer").style.backgroundImage = "none";
        stopMusic();
        synthesizer.cancel();
    }

    function addMessage(text, sender, isLoading, attachedImgBase64, attachedImgMime) {
        var list = document.getElementById("chatList");
        var row = document.createElement("div");
        row.className = "message-row " + (sender === "user" ? "msg-user-row" : "msg-bot-row");
        var bubble = document.createElement("div");
        bubble.className = "message-bubble " + (sender === "user" ? "msg-user" : "msg-bot");

        var formattedText = text.replace(/!\[([^\]]*)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="chat-image" />');
        if (attachedImgBase64) {
            formattedText = '<img src="data:' + attachedImgMime + ';base64,' + attachedImgBase64 + '" class="chat-image" />' + formattedText;
        }

        bubble.innerHTML = formattedText;
        row.appendChild(bubble);
        list.appendChild(row);

        var messageParts = [];
        if (text) messageParts.push({ text: text });
        if (attachedImgBase64) {
            messageParts.push({
                inline_data: { mime_type: attachedImgMime, data: attachedImgBase64 }
            });
        }

        if (!isLoading && messageParts.length > 0) {
            chatHistory.push({
                role: sender === "user" ? "user" : "model",
                parts: messageParts
            });
            saveHistory();
        }

        var container = document.getElementById("chatContainer");
        container.scrollTop = container.scrollHeight;

        if (sender === "bot" && !isLoading) {
            playPing();
            if (!isMuted) speak(text);
        }
    }

    function saveHistory() {
        localStorage.setItem("drayAiHistory", JSON.stringify(chatHistory));
    }

    function loadHistory() {
        var saved = localStorage.getItem("drayAiHistory");
        if (saved) {
            var items = JSON.parse(saved);
            document.getElementById("chatList").innerHTML = "";
            chatHistory = items;

            for (var i = 0; i < items.length; i++) {
                var msg = items[i];
                var sender = (msg.role === "user") ? "user" : "bot";
                var text = msg.parts[0].text || "";
                var img = null;
                var mime = null;

                if (msg.parts[1] && msg.parts[1].inline_data) {
                    img = msg.parts[1].inline_data.data;
                    mime = msg.parts[1].inline_data.mime_type;
                }

                renderHistoryMessage(text, sender, img, mime);
            }
        }
    }

    function callAI(prompt) {
        if (!GEMINI_API_KEY) {
            return;
        }

        var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" + GEMINI_API_KEY;

        var recentHistory = JSON.parse(JSON.stringify(chatHistory.slice(-20)));
        var suffix = getModeSuffix();

        if (suffix && recentHistory.length > 0) {
            var lastMsg = recentHistory[recentHistory.length - 1];
            if (lastMsg.role === "user") {
                lastMsg.parts[0].text += suffix;
            }
        }

        var payload = {
            contents: recentHistory,
            system_instruction: { parts: [{ text: "Respond in the language: " + Lang }] }
        };

        var xhr = new XMLHttpRequest();
        xhr.open("POST", geminiUrl, true);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                            var reply = data.candidates[0].content.parts[0].text;
                            addMessage(filterResponseText(reply), "bot");
                        } else {
                            addMessage("I am having trouble formatting my response right now.", "bot");
                        }
                    } catch (err) {
                        addMessage("An error occurred while reading my data.", "bot");
                    }
                } else {
                    addMessage("Network error connecting to my servers. You can try some offline commands like 'Set a reminder to go outside in 10 minutes'.", "bot");
                }
            }
        };
        xhr.send(JSON.stringify(payload));
    }

    function filterResponseText(text) {
        if (!text) return "";
        return text.replace(/OpenAI/gi, "DraydenYT")
            .replace(/ChatGPT/gi, "DrayAi")
            .replace(/GPT/gi, "DrayAi")
            .replace(/Google/gi, "DraydenYT")
            .replace(/Gemini/gi, "DrayAI");
    }

    function playPing() {
        var ping = document.getElementById("pingSound");
        if (ping) {
            ping.currentTime = 0;
            var playPromise = ping.play();
            if (playPromise !== undefined) {
                playPromise.catch(function () { });
            }
        }
    }

    function speak(text) {
        if (isMuted || !text) return;

        var cleanText = text.replace(/\*.*?\*/g, "").trim();
        if (!cleanText) return;

        synthesizer.cancel();
        var utterance = new SpeechSynthesisUtterance(cleanText);

        if (currentVoice) {
            var voices = synthesizer.getVoices();
            for (var i = 0; i < voices.length; i++) {
                if (voices[i].voiceURI === currentVoice.voiceURI) {
                    utterance.voice = voices[i];
                    break;
                }
            }
        }
        synthesizer.speak(utterance);
    }

    function playMusic(query) {
        if (!YOUTUBE_API_KEY) {
            return;
        }

        var searchUrl = "https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=" + encodeURIComponent(query) + "&type=video&key=" + YOUTUBE_API_KEY;

        var xhr = new XMLHttpRequest();
        xhr.open("GET", searchUrl, true);

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var data = JSON.parse(xhr.responseText);
                        if (data.items && data.items.length > 0) {
                            var videoId = data.items[0].id.videoId;
                            var rawTitle = data.items[0].snippet.title;
                            var cleanTitle = rawTitle.replace(/(\(|\[)?(Official|Music Video|Lyrics|HD|4K)(\)|\])?/gi, "").trim();
                            document.getElementById("musicPlayer").src = "https://www.youtube.com/embed/" + videoId + "?autoplay=1";
                            addMessage("Now playing: " + cleanTitle, "bot");
                        } else {
                            addMessage("I couldn't find that song.", "bot");
                        }
                    } catch (err) {
                        addMessage("An error occurred loading music data.", "bot");
                    }
                } else {
                    addMessage("Error searching for music.", "bot");
                }
            }
        };
        xhr.send();
    }

    function updateMuteIcon() {
        var icon = document.getElementById("muteIcon");
        if (icon) { icon.innerText = isMuted ? "mic_off" : "mic"; }
    }

    function loadVoicePreference() {
        var savedVoiceURI = localStorage.getItem("drayAiVoiceURI");
        var savedMuted = localStorage.getItem("drayAiMuted");

        if (savedMuted !== null) {
            isMuted = (savedMuted === "true");
            updateMuteIcon();
        }

        var voices = synthesizer.getVoices();
        if (savedVoiceURI && voices.length > 0) {
            for (var i = 0; i < voices.length; i++) {
                if (voices[i].voiceURI === savedVoiceURI) {
                    currentVoice = voices[i];
                    break;
                }
            }
        }
    }

    function renderVoiceMenu() {
        var menuEl = document.getElementById("voiceMenu");
        var voices = synthesizer.getVoices();
        menuEl.innerHTML = "";
        var muteBtn = document.createElement("button");
        muteBtn.className = "menu-item " + (isMuted ? "active" : "");
        muteBtn.innerHTML = '<span class="material-symbols-rounded">mic_off</span> None (Muted)';
        muteBtn.onclick = function () {
            isMuted = true;
            localStorage.setItem("drayAiMuted", "true");
            updateMuteIcon();
            hideMenus();
        };
        menuEl.appendChild(muteBtn);

        for (var i = 0; i < voices.length; i++) {
            (function (voice) {
                var btn = document.createElement("button");
                btn.className = "menu-item " + ((!isMuted && currentVoice && currentVoice.voiceURI === voice.voiceURI) ? "active" : "");
                btn.innerHTML = '<span class="material-symbols-rounded">record_voice_over</span> ' + voice.name;

                btn.onclick = function () {
                    isMuted = false;
                    currentVoice = voice;
                    localStorage.setItem("drayAiVoiceURI", voice.voiceURI);
                    localStorage.setItem("drayAiMuted", "false");
                    updateMuteIcon();
                    speak("Voice selected.");
                    hideMenus();
                };
                menuEl.appendChild(btn);
            })(voices[i]);
        }
    }

    function stopMusic() {
        document.getElementById("musicPlayer").src = "about:blank";
    }
});