(function () {
    "use strict";

    /* ---------- Config ---------- */
    // Get a key at https://enter.pollinations.ai  (starts with sk_ or pk_)
    // WARNING: a secret key (sk_) is visible to anyone who views page source.
    // Prefer a publishable key (pk_) for public sites, or run a tiny proxy.
    var API_URL = "https://gen.pollinations.ai/v1/chat/completions";
    var API_KEY = "sk_sK45Ap1pI8OtbAoYWc7hxZA5HP08Q7Bt";
    var MODEL = "community/morriszdweck/glm-5.3-flash-free";
    var MAX_MSGS = 40;              // most recent messages sent to the AI (everything is still stored)
    var MAX_CHARS = 12000;
    var GREETING = "(The user has just opened the app. Greet them warmly in one or two short sentences and invite them to chat.)";

    var TOOLS = [{
        type: "function",
        "function": {
            name: "set_background",
            description: "Changes the app's background video. Only call when the user asks to change the background.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "Direct https link to an .mp4 video file that matches the request" }
                },
                required: ["url"]
            }
        }
    }];

    /* ---------- Helpers ---------- */
    function $(id) { return document.getElementById(id); }
    function get(k, d) { var v = localStorage.getItem(k); return v === null ? d : v; }
    function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
    function clean(t) {
        return trim((t || "").replace(/[*_`#>~\[\]]/g, "").replace(/[\uD800-\uDFFF]/g, "").replace(/\s+/g, " "));
    }
    // Removes <think>...</think> reasoning (and anything before a stray closing tag)
    function stripThink(t) {
        t = (t || "").replace(/<think(ing)?>[\s\S]*?<\/think(ing)?>/gi, "");
        return t.replace(/^[\s\S]*<\/think(ing)?>/i, "");
    }

    var hint = $("hint"), voiceSel = $("voiceSel");
    var SR = window.webkitSpeechRecognition;
    var state = "idle", muted = false, rec = null, speakId = 0, current = null;
    var voices = [], voice = null, rate = 1;

    /* ---------- UI state ---------- */
    function showHint(t) {
        if (t) { hint.textContent = t; }
        hint.className = t ? "show" : "";
    }
    function setState(s) {
        state = s;
        showHint(s === "listening" ? "I'm Listening" : "");
        $("interrupt").className = (s === "speaking") ? "show" : "";
    }

    /* ---------- Chat history (kept forever) ---------- */
    var history = [];
    (function () {
        var raw = localStorage.getItem("history");
        if (!raw) { return; }
        try { history = JSON.parse(raw); }
        catch (e) { put("history_backup", raw); history = []; }   // never lose the old data
    }());
    function addMsg(role, content) {
        history.push({ role: role, content: content });
        put("history", JSON.stringify(history));
    }
    function recent() {
        var out = [], chars = 0;
        for (var i = history.length - 1; i >= 0 && out.length < MAX_MSGS; i--) {
            chars += history[i].content.length;
            if (chars > MAX_CHARS && out.length) { break; }
            out.unshift(history[i]);
        }
        return out;
    }

    /* ---------- AI (request is sent by main.js) ---------- */
    function systemPrompt() {
        return "You are a warm, kind and helpful companion having a spoken conversation with " + get("userName", "a friend") +
            ". Call them by name now and then, not in every sentence. Because your words are read aloud, reply in short, natural " +
            "spoken sentences (usually one to three) in plain text: no markdown, lists, emojis or links. " +
            "If the user asks to change the background, find a direct, publicly accessible .mp4 link that matches their request " +
            "(for example from a stock footage site) and call set_background with it. If the tool says it failed, try a different link. " +
            "Afterwards, briefly tell them what you did. Never call set_background unless they ask.";
    }
    function post(body, cb) {
        var headers = { "Content-Type": "application/json" };
        if (API_KEY) { headers.Authorization = "Bearer " + API_KEY; }
        fetch(API_URL, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.text().then(function (t) {
                if (r.status >= 200 && r.status < 300) {
                    try { cb(null, JSON.parse(t).choices[0].message); }
                    catch (e) { cb(e); }
                } else {
                    var m = "HTTP " + r.status;
                    try {
                        var j = JSON.parse(t);
                        m += ": " + ((j.error && (j.error.message || j.error)) || j.message || "");
                    } catch (e) { }
                    cb(new Error(m));
                }
            });
        }).catch(function () {
            cb(new Error("Can't reach the AI right now"));
        });
    }
    function runTool(call, cb) {
        var args = {};
        try { args = JSON.parse(call["function"].arguments); } catch (e) { }
        if (call["function"].name === "set_background" && args.url) {
            window.AppApi.setBackground(args.url, function (ok) {
                cb(ok ? "Background changed." : "That video failed to load. Try a different direct .mp4 link.");
            });
        } else { cb("Unknown tool or missing url."); }
    }
    function ask(messages, round, cb) {
        var body = { model: MODEL, messages: messages };
        if (round < 3) { body.tools = TOOLS; }
        post(body, function (err, msg) {
            if (err) { cb(err); return; }
            var calls = msg.tool_calls;
            if (calls && calls.length && round < 3) {
                messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
                var pending = calls.length;
                for (var i = 0; i < calls.length; i++) { runOne(calls[i]); }
                return;
            }
            cb(null, stripThink(msg.content));

            function runOne(call) {
                runTool(call, function (result) {
                    messages.push({ role: "tool", tool_call_id: call.id, content: result });
                    pending--;
                    if (pending === 0) { ask(messages, round + 1, cb); }
                });
            }
        });
    }

    /* ---------- Exposed app API (the AI's tool calls this) ---------- */
    var layers = [$("bgA"), $("bgB")], top = 0;
    function setBackground(url, cb) {
        if (!/^https?:\/\//i.test(url)) { if (cb) { cb(false); } return; }
        var next = layers[1 - top], cur = layers[top], finished = false, timer;
        function finish(ok) {
            if (finished) { return; }
            finished = true;
            clearTimeout(timer);
            next.onloadeddata = next.onerror = null;
            if (ok) {
                next.className = "bg show";
                cur.className = "bg";
                top = 1 - top;
                put("bg", url);
                setTimeout(function () { cur.pause(); }, 1300);
            } else {
                next.removeAttribute("src");
            }
            if (cb) { cb(ok); }
        }
        timer = setTimeout(function () { finish(false); }, 15000);
        next.onloadeddata = function () { finish(true); };
        next.onerror = function () { finish(false); };
        next.src = url;
        next.load();
    }
    window.AppApi = { setBackground: setBackground };

    /* ---------- Speaking (Chrome speechSynthesis) ---------- */
    function chunks(t) {
        var parts = t.match(/[^.!?]+[.!?]*\s*/g) || [t], out = [], cur = "";
        for (var i = 0; i < parts.length; i++) {
            cur += parts[i];
            if (cur.length > 120) { out.push(cur); cur = ""; }
        }
        if (cur) { out.push(cur); }
        return out;
    }
    function speak(text, done) {
        var id = ++speakId, parts = chunks(text), i = 0;
        function next() {
            if (id !== speakId) { return; }
            if (i >= parts.length) { done(); return; }
            var u = current = new SpeechSynthesisUtterance(parts[i++]);   // keep a reference so it isn't garbage collected
            if (voice) { u.voice = voice; }
            u.rate = rate;
            u.onend = next;
            u.onerror = next;
            speechSynthesis.speak(u);
        }
        next();
    }
    function interrupt() {
        speakId++;
        speechSynthesis.cancel();
        listen();
    }

    /* ---------- Listening (Chrome speech recognition) ---------- */
    function speechError(code) {
        setState("idle");
        if (code === "not-allowed" || code === "service-not-allowed") { showHint("Allow microphone access"); }
        else if (code === "audio-capture") { showHint("No microphone found"); }
        else if (code === "network") { showHint("Speech service unavailable (network)"); }
        else { showHint("Speech error: " + code); }
    }
    function listen() {
        if (muted) { setState("idle"); return; }
        setState("listening");
        var r = rec = new SR();
        r.lang = navigator.language || "en-US";
        r.continuous = false;
        r.interimResults = false;
        r.onresult = function (e) {
            if (r !== rec) { return; }
            var text = clean(e.results[e.results.length - 1][0].transcript);
            if (text) { rec = null; send(text); }
        };
        r.onerror = function (e) {
            if (r !== rec) { return; }
            if (e.error === "no-speech" || e.error === "aborted") { return; }   // onend listens again
            rec = null;
            speechError(e.error);
        };
        r.onend = function () {
            if (r !== rec) { return; }
            rec = null;
            listen();
        };
        try { r.start(); } catch (err) { rec = null; speechError("start-failed"); }
    }

    /* ---------- One conversation turn ---------- */
    function send(text, trigger) {
        if (text) { addMsg("user", text); }
        setState("thinking");
        var msgs = [{ role: "system", content: systemPrompt() }].concat(recent());
        if (trigger) { msgs.push({ role: "user", content: trigger }); }
        ask(msgs, 0, function (err, reply) {
            if (err) {
                setState("idle");
                showHint(/^HTTP 401/.test(err.message) ? "Add your API key in renderer.js" : String(err.message).substr(0, 80));
                setTimeout(function () { if (state === "idle") { listen(); } }, 3000);
                return;
            }
            reply = clean(reply);
            if (!reply) { listen(); return; }
            addMsg("assistant", reply);
            setState("speaking");
            speak(reply, listen);
        });
    }
    function begin() { send(null, GREETING); }

    /* ---------- Settings ---------- */
    function applyVoice(uri) {
        for (var i = 0; i < voices.length; i++) {
            if (voices[i].voiceURI === uri) { voice = voices[i]; put("voiceURI", uri); return; }
        }
    }
    function loadVoices() {
        voices = speechSynthesis.getVoices();
        voiceSel.options.length = 0;
        voice = null;
        for (var i = 0; i < voices.length; i++) {
            voiceSel.options.add(new Option(voices[i].name + " (" + voices[i].lang + ")", voices[i].voiceURI));
            if (voices[i].default && !voice) { voice = voices[i]; }
        }
        applyVoice(get("voiceURI", ""));
        if (voice) { voiceSel.value = voice.voiceURI; }
    }
    function applyRate(r) {
        rate = r;
        $("rate").value = r;
        $("rateVal").textContent = r.toFixed(1) + "x";
        put("rate", r);
    }
    function saveName(v) {
        v = trim(v);
        if (v) { put("userName", v); }
        return v;
    }
    function submitName() {
        if (!saveName($("nameIn").value)) { return; }
        $("nameSet").value = get("userName", "");
        $("welcome").className = "";
        begin();
    }

    /* ---------- Wire up ---------- */
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    applyRate(parseFloat(get("rate", "1")));
    $("nameSet").value = get("userName", "");

    voiceSel.addEventListener("change", function () { applyVoice(voiceSel.value); });
    $("rate").addEventListener("input", function () { applyRate(parseFloat($("rate").value)); });
    $("nameSet").addEventListener("change", function () { saveName($("nameSet").value); });
    $("nameGo").addEventListener("click", submitName);
    $("nameIn").addEventListener("keydown", function (e) { if (e.keyCode === 13) { submitName(); } });
    $("interrupt").addEventListener("click", interrupt);
    $("quit").addEventListener("click", function () {
        if (window.opener) { window.close(); }
        else { showHint("Close the browser tab to exit"); setTimeout(function(){ if(state==="idle"||state==="listening") showHint(state==="listening"?"I'm Listening":""); }, 2500); }
    });
    $("gear").addEventListener("click", function () {
        var p = $("settings");
        p.className = (p.className === "open") ? "" : "open";
    });
    document.addEventListener("click", function (e) {
        var t = e.target;
        while (t) {
            if (t === $("settings") || t === $("gear")) { return; }
            t = t.parentNode;
        }
        $("settings").className = "";
    });
    $("mic").addEventListener("click", function () {
        muted = !muted;
        $("mic").className = muted ? "btn off" : "btn";
        if (muted) {
            if (state === "listening") {
                var r = rec;
                rec = null;
                setState("idle");
                if (r) { r.abort(); }
            }
        } else if (state === "idle") {
            listen();
        }
    });

    var savedBg = get("bg", "");
    if (savedBg) { setBackground(savedBg); }

    if (get("userName", "")) {
        begin();
    } else {
        $("welcome").className = "show";
    }
}());
