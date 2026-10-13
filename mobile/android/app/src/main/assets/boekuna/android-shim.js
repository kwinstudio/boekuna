// Boekuna Android shell: makes browser-only features work inside the Android WebView.
// Runs before the page scripts on https://app.boekuna.nl. The web app itself is unchanged.
(function () {
  if (window.__boekunaAndroidShim) return;
  window.__boekunaAndroidShim = true;
  var bridge = window.BoekunaAndroid;
  if (!bridge || typeof bridge.postMessage !== 'function') return;

  var blobs = new Map();
  var nativeCreate = URL.createObjectURL.bind(URL);
  var nativeRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (obj) {
    var url = nativeCreate(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    // Keep our reference a little longer: the save may still be reading it.
    setTimeout(function () { blobs.delete(url); }, 120000);
    return nativeRevoke(url);
  };

  function post(message) {
    try { bridge.postMessage(JSON.stringify(message)); } catch (err) { console.warn('BoekunaAndroid', err); }
  }

  function sendBlob(action, blob, name, extra) {
    var reader = new FileReader();
    reader.onload = function () {
      var result = String(reader.result || '');
      var comma = result.indexOf(',');
      post(Object.assign({
        action: action,
        name: name || (blob && blob.name) || 'bestand',
        mime: (blob && blob.type) || 'application/octet-stream',
        data: comma >= 0 ? result.slice(comma + 1) : ''
      }, extra || {}));
    };
    reader.onerror = function () { post({ action: 'error', message: 'Bestand kon niet worden gelezen.' }); };
    reader.readAsDataURL(blob);
  }

  function blobFromUrl(url) {
    if (blobs.has(url)) return Promise.resolve(blobs.get(url));
    return fetch(url).then(function (res) { return res.blob(); });
  }

  function handleAnchor(a) {
    var href = a && a.href ? String(a.href) : '';
    if (!href) return false;
    var isBlob = href.indexOf('blob:') === 0, isData = href.indexOf('data:') === 0;
    if (!isBlob && !isData) return false;
    var hasDownload = a.hasAttribute('download');
    var name = a.getAttribute('download') || '';
    blobFromUrl(href).then(function (blob) {
      if (!name && blob && blob.name) name = blob.name;
      sendBlob(hasDownload ? 'save' : 'open', blob, name || ('boekuna-' + Date.now() + extFor(blob.type)));
    }).catch(function () { post({ action: 'error', message: 'Bestand kon niet worden geopend.' }); });
    return true;
  }

  function extFor(type) {
    type = String(type || '').toLowerCase();
    if (type === 'application/pdf') return '.pdf';
    if (type === 'image/png') return '.png';
    if (type === 'image/jpeg') return '.jpg';
    if (type === 'application/json') return '.json';
    if (type.indexOf('csv') >= 0) return '.csv';
    return '';
  }

  var nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (handleAnchor(this)) return;
    return nativeClick.apply(this, arguments);
  };
  document.addEventListener('click', function (event) {
    if (!event.isTrusted || event.defaultPrevented) return;
    var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (a && handleAnchor(a)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);

  // window.open(blob) shows a document; window.open('') + document.write is the invoice print view.
  var nativeOpen = window.open;
  window.open = function (url) {
    var target = url == null ? '' : String(url);
    if (target.indexOf('blob:') === 0 || target.indexOf('data:') === 0) {
      blobFromUrl(target).then(function (blob) { sendBlob('open', blob, 'boekuna-document' + extFor(blob.type)); });
      return { closed: false, close: function () {}, focus: function () {} };
    }
    if (target === '' || target === 'about:blank') return printWindow();
    return nativeOpen.apply(window, arguments);
  };

  function printWindow() {
    var html = '';
    var fake = {
      closed: false,
      opener: window,
      focus: function () {},
      close: function () { fake.closed = true; },
      print: function () {},
      document: {
        open: function () { html = ''; },
        write: function () { html += Array.prototype.join.call(arguments, ''); },
        writeln: function () { html += Array.prototype.join.call(arguments, '') + '\n'; },
        close: function () { post({ action: 'print', html: html, name: document.title || 'Boekuna' }); }
      }
    };
    return fake;
  }

  window.print = function () { post({ action: 'printPage', name: document.title || 'Boekuna' }); };

  // Report previews print from a same-origin iframe; print its HTML natively.
  var frameWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  if (frameWindow && frameWindow.get) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      enumerable: frameWindow.enumerable,
      get: function () {
        var w = frameWindow.get.call(this);
        try {
          if (w && !w.__boekunaPrint) {
            w.__boekunaPrint = true;
            w.print = function () {
              post({ action: 'print', html: '<!doctype html>' + w.document.documentElement.outerHTML, name: document.title || 'Boekuna' });
            };
          }
        } catch (err) { /* cross-origin frame: leave it alone */ }
        return w;
      }
    });
  }

  // Android WebView has no Web Share API; hand files and text to the Android share sheet.
  var hasNativeShare = typeof navigator.share === 'function';
  if (!hasNativeShare) {
    navigator.canShare = function (data) {
      return !!(data && ((data.files && data.files.length) || data.text || data.url || data.title));
    };
    navigator.share = function (data) {
      data = data || {};
      var file = data.files && data.files[0];
      var extra = { title: data.title || '', text: [data.text, data.url].filter(Boolean).join('\n') };
      if (file) sendBlob('share', file, file.name, extra);
      else post(Object.assign({ action: 'shareText' }, extra));
      return Promise.resolve();
    };
  }
})();
