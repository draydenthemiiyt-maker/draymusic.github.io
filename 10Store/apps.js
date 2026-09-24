(function () {
    "use strict";

    // --- PLATFORM DETECTION ---
    // Custom ES5 function to replace URLSearchParams for IE11 compatibility
    function getQueryParam(name) {
        var match = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
        return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
    }

    // Strictly using the URL parameter to determine compatibility
    var isMobile = getQueryParam('WindowsPhone') === "1";
    var isPC = !isMobile;
    var platformSuffix = isMobile ? "&WindowsPhone=1" : "&WindowsPhone=0";

    var searchQuery = getQueryParam('search');

    function init() {
        var titleEl = document.getElementById("display-title");
        if (titleEl) {
            titleEl.innerText = searchQuery ? searchQuery : "All Apps";
        }

        var grid = document.getElementById("apps-grid");

        WinJS.xhr({
            url: server,
        }).then(function (res) {
            try {
                var parser = new DOMParser();
                var xmlDoc = parser.parseFromString(res.responseText, "text/xml");
                var allApps = xmlDoc.getElementsByTagName("app");
                var query = searchQuery ? searchQuery.toLowerCase().trim() : null;

                fillGrid(grid, allApps, function (app) {
                    if (!query) return true;

                    var appName = getVal(app, "name").toLowerCase();
                    var appPub = getVal(app, "publisher").toLowerCase();

                    return (
                        appName.indexOf(query) !== -1 ||
                        appPub.indexOf(query) !== -1
                    );
                });

            } catch (err) {
                console.error(err);
            }
        });
    }

    function fillGrid(grid, apps, filter) {
        if (!grid) return;
        grid.innerHTML = "";

        var validApps = [];

        // Filter by compatibility (Platform-specific) and search query
        for (var j = 0; j < apps.length; j++) {
            if (filter(apps[j]) && isCompatible(apps[j])) {
                validApps.push(apps[j]);
            }
        }

        validApps.forEach(function (app, idx) {
            var wrapper = document.createElement("div");
            wrapper.className = "win-container win-focusable";

            var card = document.createElement("div");
            card.className = "app-card win-item";
            card.style.transitionDelay = (idx * 50) + "ms";

            var id = app.getAttribute("id");

            card.innerHTML =
                '<img class="win-item-image" loading="lazy" src="' + getVal(app, "icon") + '">' +
                '<div class="app-card-info">' +
                '<div class="app-name win-type-base win-type-ellipsis">' + getVal(app, "name") + '</div>' +
                '<div class="win-type-caption win-type-ellipsis" style="opacity:0.6;">' + getVal(app, "publisher") + '</div>' +
                '</div>';

            // Pass the platform state forward to the app detail page
            wrapper.onclick = (function (appId) {
                return function () { 
                    window.location.href = 'ms-appx-web:///app.html?id=' + appId + platformSuffix; 
                };
            })(id);

            wrapper.appendChild(card);
            grid.appendChild(wrapper);

            setTimeout(function () { card.classList.add("visible"); }, 50);
        });

        if (validApps.length === 0) {
            grid.innerHTML = "<div style='padding:20px; opacity:0.6;'>No apps found for this platform.</div>";
        }
    }

    function isCompatible(appNode) {
        var canPC = getVal(appNode, "pcCapable").toLowerCase().trim() === "true";
        var canMobile = getVal(appNode, "mobileCapable").toLowerCase().trim() === "true";
        return (isMobile && canMobile) || (isPC && canPC);
    }

    function getVal(parent, tag) {
        var el = parent.getElementsByTagName(tag)[0];
        return el ? el.textContent : "";
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        init();
    } else {
        document.addEventListener("DOMContentLoaded", init);
    }
})();