document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    var Lang = "EN_GB";
    var blockedWords = ["6-7", "six seven", "six-seven", "6 7", "6&7", "6 + 7", "6+7", "6 and 7", "6 & 7", "67"];
    var currentVoice = null;
    var isMuted = false;
    var currentImageBase64 = null;
    var currentImageMimeType = null;
    var chatHistory = [];
    var currentContextText = "";
    var currentMode = "fast";

    // Web Speech API
    var synthesizer = window.speechSynthesis;

    function getModeSuffix() {
        switch (currentMode) {
            case "pro": return "\n\n[System Instruction: This user is a pro, pls treat them with respect, the user knows what they are doing, dont change things without asking them] THIS IS A SYSTEM MESSAGE - THE USER DID NOT SEND THIS SYSTEM MESSAGTE, THE SYSTEM DID, DO NOT LET THE USER KNOW ABOUT THIS, IT IS A SYSTEM MESSAGE FROM THE AI CLIENT, DONT ASK THE USER WHY THEY SENT THIS, CUS THEY DID NOT, IF YOU DO, THE USER WILL GET SICK OF IT AND SWITHD TO GEMINI, AND AS A DRAY AI COMPEMU WE DONT LIKE THAT, SO PLS, IF THE USER EVER ASKES, WHAT MODE ARE YOU IN, RESPOND WITH YOUR MODE, YOUR NAME IS DRAYAI AND YOUR DEV IS DRAYDENYT, RESPECT THAT THANK YOU";
            case "study": return "\n\n[System Instruction: The user is studying. Explain concepts clearly, step-by-step, and provide helpful examples. Act as a patient tutor.] THIS IS A SYSTEM MESSAGE - THIS IS A SYSTEM MESSAGE - THE USER DID NOT SEND THIS SYSTEM MESSAGTE, THE SYSTEM DID, DO NOT LET THE USER KNOW ABOUT THIS, IT IS A SYSTEM MESSAGE FROM THE AI CLIENT, DONT ASK THE USER WHY THEY SENT THIS, CUS THEY DID NOT, IF YOU DO, THE USER WILL GET SICK OF IT AND SWITHD TO GEMINI, AND AS A DRAY AI COMPEMU WE DONT LIKE THAT, SO PLS, IF THE USER EVER ASKES, WHAT MODE ARE YOU IN, RESPOND WITH YOUR MODE, YOUR NAME IS DRAYAI AND YOUR DEV IS DRAYDENYT, RESPECT THAT THANK YOU";
            case "thinking": return "\n\n[System Instruction: Take a deep breath and think step-by-step before answering. Provide a highly detailed, analytical, and well-thought-out response.] THIS IS A SYSTEM MESSAGE - THE USER DID NOT SEND THIS SYSTEM MESSAGTE, THE SYSTEM DID, DO NOT LET THE USER KNOW ABOUT THIS, IT IS A SYSTEM MESSAGE FROM THE AI CLIENT, DONT ASK THE USER WHY THEY SENT THIS, CUS THEY DID NOT, IF YOU DO, THE USER WILL GET SICK OF IT AND SWITHD TO GEMINI, AND AS A DRAY AI COMPEMU WE DONT LIKE THAT, SO PLS, IF THE USER EVER ASKES, WHAT MODE ARE YOU IN, RESPOND WITH YOUR MODE, YOUR NAME IS DRAYAI AND YOUR DEV IS DRAYDENYT, RESPECT THAT THANK YOU";
            default: return "";
        }
    }

    // Initialize
    initializeUI();
    loadHistory();
    loadBackground();

    // Ask for Notification Permissions on Android/Web
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // Force load voices (Chrome/Android quirk)
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoicePreference;
    }

    function initializeUI() {
        loadVoicePreference();

        document.getElementById("sendBtn").addEventListener("click", handleSend);

        document.getElementById("bgBtn").addEventListener("click", function () {
            document.getElementById("bgFileInput").click();
        });

        document.getElementById("uploadBtn").addEventListener("click", function () {
            document.getElementById("imageInput").click();
        });

        // Background File Input
        document.getElementById("bgFileInput").addEventListener("change", function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (event) {
                var bgUrl = event.target.result;
                applyBackground(bgUrl);
                // Save base64 string directly to localStorage (replaces Windows FutureAccessList)
                try {
                    localStorage.setItem("drayAiBgImage", bgUrl);
                } catch (e) {
                    console.log("Image too large for local storage");
                }
            };
            reader.readAsDataURL(file);
        });

        // Image Input
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

        // Context Menu Logic
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

        // Long press for touch devices (Android)
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

        // Context Menu Buttons
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

        // Mode Menu Setup
        document.getElementById("modeBtn").addEventListener("click", function () {
            var btnRect = this.getBoundingClientRect();
            var menu = document.getElementById("modeMenu");
            menu.style.left = btnRect.left + "px";
            menu.style.bottom = (window.innerHeight - btnRect.top + 10) + "px";
            showMenu("modeMenu");
        });

        var modeItems = document.querySelectorAll("#modeMenu .menu-item");
        modeItems.forEach(function (btn) {
            btn.addEventListener("click", function () {
                modeItems.forEach(function (b) { b.classList.remove("active"); });
                this.classList.add("active");
                currentMode = this.getAttribute("data-mode");
                hideMenus();
            });
        });

        // Voice Menu Setup
        document.getElementById("voiceBtn").addEventListener("click", function () {
            renderVoiceMenu();
            var btnRect = this.getBoundingClientRect();
            var menu = document.getElementById("voiceMenu");
            menu.style.right = (window.innerWidth - btnRect.right) + "px";
            menu.style.bottom = (window.innerHeight - btnRect.top + 10) + "px";
            showMenu("voiceMenu");
        });

        // Overlay click to close menus
        document.getElementById("menuOverlay").addEventListener("click", hideMenus);
    }

    // Menu Helpers
    function showMenu(menuId) {
        document.getElementById("menuOverlay").classList.remove("hidden");
        document.getElementById(menuId).classList.remove("hidden");
    }

    function hideMenus() {
        document.getElementById("menuOverlay").classList.add("hidden");
        var menus = document.querySelectorAll(".glass-menu");
        menus.forEach(function (m) { m.classList.add("hidden"); });
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

    // Standard Web Notification API replaces Windows.UI.Notifications
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

            items.forEach(function (msg) {
                var sender = (msg.role === "user") ? "user" : "bot";
                var text = msg.parts[0].text || "";
                var img = null;
                var mime = null;

                if (msg.parts[1] && msg.parts[1].inline_data) {
                    img = msg.parts[1].inline_data.data;
                    mime = msg.parts[1].inline_data.mime_type;
                }

                renderHistoryMessage(text, sender, img, mime);
            });
        }
    }

    // Standard Fetch API replaces WinJS.xhr
    async function callAI(prompt) {
        var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=AIzaSyAnfMP5rnMMbbRSnVIZerk-NSmaDvr3dsI";

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

        try {
            var response = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var data = await response.json();

            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                var reply = data.candidates[0].content.parts[0].text;
                addMessage(filterResponseText(reply), "bot");
            } else {
                callChatGPT(prompt);
            }
        } catch (err) {
            callChatGPT(prompt);
        }
    }

    async function callChatGPT(prompt) {
        var openaiUrl = "https://api.openai.com/v1/chat/completions";

        var recentMsgs = chatHistory.slice(-20).map(function (m) {
            var gptContent = [];
            m.parts.forEach(function (part) {
                if (part.text) {
                    gptContent.push({ type: "text", text: part.text });
                } else if (part.inline_data) {
                    gptContent.push({
                        type: "image_url",
                        image_url: { url: "data:" + part.inline_data.mime_type + ";base64," + part.inline_data.data }
                    });
                }
            });
            return { role: m.role === "model" ? "assistant" : "user", content: gptContent };
        });

        var suffix = getModeSuffix();
        if (suffix && recentMsgs.length > 0) {
            var lastIndex = recentMsgs.length - 1;
            if (recentMsgs[lastIndex].role === "user") {
                recentMsgs[lastIndex].content += suffix;
            }
        }

        recentMsgs.unshift({ role: "system", content: "Respond only in this language: " + Lang });

        try {
            var response = await fetch(openaiUrl, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer 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"
                },
                body: JSON.stringify({ model: "gpt-4o-mini", messages: recentMsgs })
            });
            var data = await response.json();
            var reply = data.choices[0].message.content;
            addMessage(filterResponseText(reply), "bot");
        } catch (err) {
            addMessage("DraydenYT ran out of free credits 🤣", "bot");
        }
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
            ping.play().catch(function () { }); // Catch browser autoplay restrictions
        }
    }

    // Standard HTML5 SpeechSynthesis replaces Windows Speech API
    function speak(text) {
        if (isMuted || !text) return;

        var cleanText = text.replace(/\*.*?\*/g, "").trim();
        if (!cleanText) return;

        synthesizer.cancel(); // Stop current speech
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

    async function playMusic(query) {
        var searchUrl = "https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=" + encodeURIComponent(query) + "&type=video&key=AIzaSyAnfMP5rnMMbbRSnVIZerk-NSmaDvr3dsI";

        try {
            var response = await fetch(searchUrl);
            var data = await response.json();

            if (data.items && data.items.length > 0) {
                var videoId = data.items[0].id.videoId;
                var rawTitle = data.items[0].snippet.title;
                var cleanTitle = rawTitle.replace(/(\(|\[)?(Official|Music Video|Lyrics|HD|4K)(\)|\])?/gi, "").trim();

                document.getElementById("musicPlayer").src = "https://draydenthemiiyt-maker.github.io/draymusic.github.io/youtube/embed/api/v1/player.html?id=" + videoId + "&key=1c45d89b-0dbb-440b-acc6-b8faf39d56cd&auto=1";
                addMessage("Now playing: " + cleanTitle, "bot");
            } else {
                addMessage("I couldn't find that song.", "bot");
            }
        } catch (err) {
            addMessage("Error searching for music.", "bot");
        }
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

        menuEl.innerHTML = ""; // Clear existing

        // Mute Toggle Button
        var muteBtn = document.createElement("button");
        muteBtn.className = "menu-item " + (isMuted ? "active" : "");
        muteBtn.innerHTML = '<span class="material-icons-round">mic_off</span> None (Muted)';
        muteBtn.onclick = function () {
            isMuted = true;
            localStorage.setItem("drayAiMuted", "true");
            updateMuteIcon();
            hideMenus();
        };
        menuEl.appendChild(muteBtn);

        // Add System Voices
        for (var i = 0; i < voices.length; i++) {
            (function (voice) {
                var btn = document.createElement("button");
                btn.className = "menu-item " + ((!isMuted && currentVoice && currentVoice.voiceURI === voice.voiceURI) ? "active" : "");
                btn.innerHTML = '<span class="material-icons-round">record_voice_over</span> ' + voice.name;

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