const frame = document.getElementById('contentFrame');
const pageTitle = document.getElementById('page-title');
const backBtn = document.getElementById('backBtn');

function navigateTo(url) {
  document.body.style.opacity = '0';
  setTimeout(() => {
    frame.src = url;
  }, 300);
}

window.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'navigate' && event.data.url) {
    navigateTo(event.data.url);
  }
});

backBtn.addEventListener('click', () => {
  navigateTo('home.html');
});

frame.addEventListener('load', () => {
  try {
    const frameDoc = frame.contentDocument || frame.contentWindow.document;

    if (frameDoc && !frameDoc.getElementById('injected-nav-script')) {
      const script = frameDoc.createElement('script');
      script.id = 'injected-nav-script';
      script.textContent = `
        function requestNavigation(targetUrl) {
          window.parent.postMessage({
            action: 'navigate',
            url: targetUrl
          }, '*');
        }
      `;
      frameDoc.head.appendChild(script);
    }

    if (frameDoc && frameDoc.title) {
      pageTitle.textContent = frameDoc.title;
    }

    const currentPath = frame.contentWindow.location.pathname;
    if (currentPath.endsWith('home.html') || currentPath.endsWith('/')) {
      backBtn.style.display = 'none';
    } else {
      backBtn.style.display = 'inline-flex';
    }

  } catch (err) {
    console.error(err);
  }

  document.body.style.opacity = '1';
});