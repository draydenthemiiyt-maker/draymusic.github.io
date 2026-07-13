var CACHE_NAME = 'drayai-offline';
var SHELL_FILES = [
    './*'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(SHELL_FILES);
        })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (key) {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});

self.addEventListener('fetch', function (event) {
    var req = event.request;
    event.respondWith(
        caches.match(req).then(function (res) {
            return res || fetch(req)['catch'](function () {
                return caches.match('./index.html');
            });
        })
    );
});
