(function () {
    "use strict";

    function getQueryParam(name) {
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)");
        var results = regex.exec(window.location.search);
        return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }

    var appId = getQueryParam('id');

    function loadAppData() {
        console.log("Fetching App Data...");

        WinJS.xhr({
            url: `${server}`,
        }).then(function (res) {
            try {
                var parser = new DOMParser();
                var xml = parser.parseFromString(res.responseText, "text/xml");

                if (!xml) return;

                var apps = xml.getElementsByTagName("app");
                var targetApp = null;

                for (var i = 0; i < apps.length; i++) {
                    if (apps[i].getAttribute("id") === appId) {
                        targetApp = apps[i];
                        break;
                    }
                }

                if (targetApp) {
                    renderApp(targetApp);
                }

            } catch (err) {
                console.error(err);
            }
        });
    }

    function renderApp(app) {
        var name = getVal(app, "name");
        var version = getVal(app, "version");
        var icon = getVal(app, "icon");
        var pub = getVal(app, "publisher");
        var desc = getVal(app, "description");
        var packageUrl = getVal(app, "package");

        function isValidImageUrl(url) {
            if (!url) return false;
            url = url.trim();
            if (url.indexOf("data:image/") === 0) return true;
            if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) {
                var lower = url.toLowerCase();
                return (/\.(png|jpe?g|gif|webp|svg)(?:[\?#].*)?$/.test(lower));
            }
            return false;
        }

        var screenshots = [];

        function isVideoUrl(url) {
            if (!url) return false;
            url = url.trim().toLowerCase();
            return url.endsWith(".mp4") || url.indexOf(".mp4?") !== -1;
        }

        for (var s = 1; s <= 5 && screenshots.length < 5; s++) {
            var tagName = "screenshot" + s;
            var el = app.getElementsByTagName(tagName)[0];
            if (el) {
                var url = (el.textContent || el.getAttribute("src") || "").trim();

                if (isValidImageUrl(url) || isVideoUrl(url)) {
                    screenshots.push(url);
                }
            }
        }

        if (screenshots.length < 5) {
            var generic = app.getElementsByTagName("screenshot");
            for (var i = 0; i < generic.length && screenshots.length < 5; i++) {
                var url2 = (generic[i].textContent || generic[i].getAttribute("src") || "").trim();

                if (isValidImageUrl(url2) || isYouTubeUrl(url2)) {
                    if (screenshots.indexOf(url2) === -1) {
                        screenshots.push(url2);
                    }
                }
            }
        }

        var html =
            '<div class="app-hero">' +
            '<img src="' + icon + '" class="app-logo-big" alt="App icon">' +
            '<div class="app-info-right">' +
            '<div class="app-title">' + name + '</div>' +
            '<a class="app-publisher" href="apps.html?search=' + encodeURIComponent(pub) + '">' + pub + '</a>' +
            '<div class="app-version">Version ' + version + '</div>' +
            '<div id="dl-container">' +
            '<button class="win-button btn-download" id="dl-btn">Download</button>' +
            '<div id="progress-wrapper" style="display:none; width:100%;">' +
            '<progress id="dl-progress"></progress>' +
            '<div id="progress-text">Downloading...</div>' +
            '</div>' +
            '</div>' +
            '<div class="app-description">' + desc + '</div>' +
            '</div>' +
            '</div>';

        html +=
            '<section class="app-screenshots" aria-label="Screenshots">' +
            '<div class="screenshots-inner">' +
            '<h2 class="screenshots-title">Screenshots</h2>' +
            '<div id="nativeCarousel" class="carousel-viewer">' +
            '<div class="carousel-inner">' +
            '<button id="prevBtn" class="win-button carousel-nav left" aria-label="Previous screenshot">' +
            '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg>' +
            '</button>' +
            '<img id="carouselImage" class="carousel-image" src="" alt="Screenshot" />' +
            '<div id="carouselPlaceholder" class="carousel-placeholder" style="display:none;">No screenshot available</div>' +
            '<button id="nextBtn" class="win-button carousel-nav right" aria-label="Next screenshot">' +
            '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"></path></svg>' +
            '</button>' +
            '</div>' +
            '</div>' +
            '<div class="carousel-changer-space" aria-hidden="true"></div>' +
            '<div id="carouselThumbs" class="carousel-thumbs" role="list" aria-label="Screenshot thumbnails"></div>' +
            '</div>' +
            '</section>';

        document.title = name;
        var contentEl = document.getElementById("app-content");
        if (contentEl) contentEl.innerHTML = html;

        var dlBtn = document.getElementById("dl-btn");
        if (dlBtn) {
            dlBtn.onclick = function () {
                var btn = this;
                var progressWrapper = document.getElementById("progress-wrapper");
                var progressBar = document.getElementById("dl-progress");
                var progressText = document.getElementById("progress-text");

                btn.disabled = true;
                progressWrapper.style.display = "block";

                showNotification(name, "Starting download...");

                sendDiscordNotification(name, function () {
                    try {
                        var uri = new Windows.Foundation.Uri(packageUrl);
                        var downloader = new Windows.Networking.BackgroundTransfer.BackgroundDownloader();

                        Windows.Storage.ApplicationData.current.localCacheFolder.createFileAsync(name + ".appx", Windows.Storage.CreationCollisionOption.replaceExisting)
                            .then(function (file) {
                                var download = downloader.createDownload(uri, file);

                                return download.startAsync().done(function () {
                                    progressBar.value = 100;
                                    progressText.innerText = "Opening installer...";
                                    showNotification(name, "Downloaded! Opening package...");
                                    Windows.System.Launcher.launchFileAsync(file);

                                    setTimeout(function () {
                                        progressWrapper.style.display = "none";
                                        btn.disabled = false;
                                        btn.innerText = "Download";
                                    }, 7000);

                                }, function (error) {
                                    progressWrapper.style.display = "none";
                                    btn.disabled = false;
                                }, function (progress) {
                                    var percent = (progress.bytesReceived / progress.totalBytesToReceive) * 100;
                                    if (!isNaN(percent)) {
                                        progressBar.value = percent;
                                        progressText.innerText = Math.floor(percent) + "%";
                                    }
                                });
                            });
                    } catch (e) {
                        window.open(packageUrl, '_blank');
                        setTimeout(function () {
                            if (progressWrapper) progressWrapper.style.display = "none";
                            btn.disabled = false;
                        }, 7000);
                    }
                });
            };
        }

        try {
            var ssSection = document.querySelector(".app-screenshots");
            var anyValid = screenshots && screenshots.length > 0;
            if (!anyValid) {
                if (ssSection && ssSection.parentNode) ssSection.parentNode.removeChild(ssSection);
                return;
            }

            var items = [];
            for (var k = 0; k < screenshots.length; k++) {
                var raw = screenshots[k];

                if (isVideoUrl(raw)) {
                    items.push({ type: "video", url: raw });
                } else {
                    items.push({ type: "image", url: raw });
                }
            }

            if (!items || items.length === 0) {
                if (ssSection && ssSection.parentNode) ssSection.parentNode.removeChild(ssSection);
                return;
            }

            var viewerImg = document.getElementById("carouselImage");
            var placeholder = document.getElementById("carouselPlaceholder");
            var prevBtn = document.getElementById("prevBtn");
            var nextBtn = document.getElementById("nextBtn");
            var thumbsContainer = document.getElementById("carouselThumbs");
            var videoEl = document.createElement("video");
            videoEl.id = "carouselVideo";
            videoEl.className = "carousel-frame";
            videoEl.style.cssText = "display:none; width:100%; height:100%; background:#000;";
            videoEl.controls = true;
            viewerImg.parentNode.insertBefore(videoEl, viewerImg.nextSibling);

            var currentIndex = 0;

            function setImageWithFade(imgEl, src, onShown) {
                try { imgEl.style.transition = "opacity 320ms ease-in-out"; } catch (e) { }
                imgEl.style.opacity = 0;

                var tmp = new Image();
                tmp.onload = function () {
                    placeholder.style.display = "none";
                    imgEl.src = src;
                    setTimeout(function () {
                        imgEl.style.opacity = 1;
                        if (typeof onShown === "function") onShown();
                    }, 20);
                };
                tmp.onerror = function () {
                    imgEl.style.opacity = 0;
                    imgEl.src = "";
                    placeholder.style.display = "block";
                    if (typeof onShown === "function") onShown();
                };
                tmp.src = src;
            }

            function showItem(item) {
                viewerImg.style.display = "none";
                videoEl.style.display = "none";
                placeholder.style.display = "none";
                videoEl.src = "";

                if (item.type === "image") {
                    setImageWithFade(viewerImg, item.url);
                    viewerImg.style.display = "block";
                }

                else if (item.type === "video") {
                    videoEl.src = item.url;
                    videoEl.style.display = "block";
                    videoEl.play();
                }
            }

            function showIndex(i) {
                if (i < 0) i = items.length - 1;
                if (i >= items.length) i = 0;
                if (items[currentIndex] && items[currentIndex].type === "video") {
                    videoEl.pause();
                    videoEl.src = "";
                }

                currentIndex = i;
                showItem(items[currentIndex]);

                var thumbs = thumbsContainer.children;
                for (var t = 0; t < thumbs.length; t++) {
                    if (parseInt(thumbs[t].getAttribute("data-index"), 10) === currentIndex) {
                        thumbs[t].className = "carousel-thumb selected";
                    } else {
                        thumbs[t].className = "carousel-thumb";
                    }
                }
            }


            // Prev/Next handlers
            prevBtn.addEventListener("click", function () {
                showIndex(currentIndex - 1);
            });
            nextBtn.addEventListener("click", function () {
                showIndex(currentIndex + 1);
            });

            // Populate thumbnails
            for (var m = 0; m < items.length; m++) {
                (function (idx) {
                    var thumbWrap = document.createElement("div");
                    thumbWrap.className = idx === 0 ? "carousel-thumb selected" : "carousel-thumb";
                    thumbWrap.setAttribute("data-index", idx);
                    thumbWrap.setAttribute("role", "listitem");
                    thumbWrap.setAttribute("tabindex", "0");

                    var img = document.createElement("img");

                    if (items[idx].type === "image") {
                        img.src = items[idx].url;
                    } else {
                        img.src = "https://www.freepnglogos.com/uploads/youtube-logo-hd-8.png";
                        img.style.objectFit = "contain";
                    }

                    img.alt = "Screenshot " + (idx + 1);

                    thumbWrap.appendChild(img);
                    thumbsContainer.appendChild(thumbWrap);

                    thumbWrap.addEventListener("click", function () {
                        var i = parseInt(this.getAttribute("data-index"), 10);
                        showIndex(i);
                    });
                })(m);
            }

            // Preload images
            for (var p = 0; p < items.length; p++) {
                if (items[p].type === "image") {
                    var pre = new Image();
                    pre.src = items[p].url;
                }
            }

            // Show initial
            showIndex(0);

        } catch (ex) {
            console.error("Screenshots initialization failed:", ex);
        }
    }


    // --- 4. HELPERS ---
    function showNotification(title, body) {
        try {
            var notifications = Windows.UI.Notifications;
            var template = notifications.ToastTemplateType.toastText02;
            var toastXml = notifications.ToastNotificationManager.getTemplateContent(template);
            var textNodes = toastXml.getElementsByTagName("text");
            textNodes[0].appendChild(toastXml.createTextNode(title));
            textNodes[1].appendChild(toastXml.createTextNode(body));
            var toast = new notifications.ToastNotification(toastXml);
            notifications.ToastNotificationManager.createToastNotifier().show(toast);
        } catch (e) {
            console.error("Notifications only work in UWP container", e);
        }
    }

    function sendDiscordNotification(appName, callback) {
        var webhook = "https://discord.com/api/webhooks/1472961404528099527/L9PAUtmL0kPoZsIePkLEUu4G-yVKbDsxlW15F98eTS2QW1DB58saGaIG2vreheFWyINA";
        var payload = JSON.stringify({ content: "**" + appName + "** was downloaded!" });
        var xhr = new XMLHttpRequest();
        xhr.open("POST", webhook, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) { callback(); }
        };
        xhr.onerror = function () { callback(); };
        xhr.send(payload);
    }

    function getVal(parent, tag) {
        var el = parent.getElementsByTagName(tag)[0];
        return el ? el.textContent : "";
    }

    // Start
    if (appId) { loadAppData(); }
})();