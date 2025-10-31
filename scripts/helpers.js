(function(){
  // Global namespace
  window.App = window.App || {};

  // Storage utilities with namespaced keys
  const LS_KEYS = {
    history: 'reelfetch.history.v1'
  };

  function safeJSONParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  window.App.Storage = {
    getHistory: function() {
      const raw = localStorage.getItem(LS_KEYS.history);
      const arr = safeJSONParse(raw);
      return Array.isArray(arr) ? arr : [];
    },
    saveHistory: function(list) {
      try { localStorage.setItem(LS_KEYS.history, JSON.stringify(list.slice(0, 50))); } catch (e) { /* ignore */ }
    },
    addHistory: function(entry) {
      const list = window.App.Storage.getHistory();
      // Dedup by url
      const filtered = list.filter(x => x.url !== entry.url);
      filtered.unshift({
        url: entry.url,
        title: entry.title || '',
        thumb: entry.thumb || '',
        author: entry.author || '',
        ts: Date.now()
      });
      window.App.Storage.saveHistory(filtered);
      return filtered;
    },
    clearHistory: function(){
      window.App.Storage.saveHistory([]);
    }
  };

  // Network helpers
  window.App.Net = {
    fetchViaProxy: function(url, opts = {}){
      // Use AllOrigins to bypass CORS and retrieve HTML content.
      // https://api.allorigins.win/raw?url=
      const proxied = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
      const timeoutMs = opts.timeout || 15000;
      return new Promise(function(resolve, reject){
        const timer = setTimeout(function(){ reject(new Error('Request timed out')); }, timeoutMs);
        $.ajax({ url: proxied, method: 'GET', dataType: 'text' })
          .done(function(html){ clearTimeout(timer); resolve(html); })
          .fail(function(xhr){ clearTimeout(timer); reject(new Error('Fetch failed: ' + (xhr && xhr.status))); });
      });
    }
  };

  // General utilities
  window.App.Util = {
    normalizeUrl: function(input){
      if (!input) return '';
      let str = String(input).trim();
      if (!/^https?:\/\//i.test(str)) str = 'https://' + str;
      return str;
    },
    isInstagramUrl: function(url){
      const re = /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel|tv|stories)\//i;
      return re.test(url);
    },
    htmlDecode: function(str){
      if (typeof str !== 'string') return str;
      return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    },
    unescapeJSONUrl: function(u){
      if (!u) return u;
      return u.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    },
    extractMetaTag: function(html, prop){
      const re = new RegExp('<meta[^>]+property=["\']'+prop+'["\'][^>]+content=["\']([^"\']+)["\']', 'i');
      const m = html.match(re);
      return m ? m[1] : '';
    },
    extractNameContent: function(html, name){
      const re = new RegExp('<meta[^>]+name=["\']'+name+'["\'][^>]+content=["\']([^"\']+)["\']', 'i');
      const m = html.match(re);
      return m ? m[1] : '';
    },
    parseAuthor: function(html){
      // Try owner username pattern
      let m = html.match(/"owner"\s*:\s*\{[^}]*"username"\s*:\s*"([^"]+)"/);
      if (m && m[1]) return m[1];
      // Fallback from og:description usually like: "username on Instagram: ..."
      const desc = window.App.Util.extractMetaTag(html, 'og:description') || '';
      if (desc) {
        const colonIdx = desc.indexOf(':');
        if (colonIdx > -1) return desc.substring(0, colonIdx).trim();
      }
      return '';
    },
    parseInstagramHTML: function(html){
      // Attempt to extract multiple MP4 candidates
      const candidates = [];
      function pushUrl(u, width, height) {
        if (!u) return;
        const url = window.App.Util.unescapeJSONUrl(u);
        if (!/\.mp4(\?|$)/i.test(url)) return;
        if (!candidates.find(c => c.url === url)) {
          const h = height ? parseInt(height, 10) : undefined;
          const w = width ? parseInt(width, 10) : undefined;
          const label = h ? `MP4 ${h}p` : 'MP4';
          candidates.push({ url, type: 'video/mp4', width: w, height: h, label });
        }
      }

      // 1) og:video tags
      pushUrl(window.App.Util.extractMetaTag(html, 'og:video:secure_url'));
      pushUrl(window.App.Util.extractMetaTag(html, 'og:video'));

      // 2) explicit JSON keys
      const directUrlRe = /"video_url"\s*:\s*"(https:[^"]+?\.mp4[^"]*)"/g;
      let m;
      while ((m = directUrlRe.exec(html)) !== null) { pushUrl(m[1]); }

      // 3) video_versions array with width/height
      const versionsBlockRe = /"video_versions"\s*:\s*\[(.*?)\]/gs;
      let vb;
      while ((vb = versionsBlockRe.exec(html)) !== null) {
        const block = vb[1];
        const itemRe = /\{[^}]*"url"\s*:\s*"(https:[^"]+?\.mp4[^"]*)"[^}]*?"width"\s*:\s*(\d+)[^}]*?"height"\s*:\s*(\d+)/gs;
        let it;
        while ((it = itemRe.exec(block)) !== null) {
          pushUrl(it[1], it[2], it[3]);
        }
      }

      // 4) last resort: any mp4 url in page
      const anyMp4Re = /(https:[^"']+?\.mp4[^"']*)/g;
      while ((m = anyMp4Re.exec(html)) !== null) { pushUrl(m[1]); }

      // Deduplicate and sort by height desc if available
      const unique = candidates.slice().sort((a,b) => (b.height||0) - (a.height||0));

      const title = window.App.Util.extractMetaTag(html, 'og:title') || window.App.Util.extractNameContent(html, 'title') || 'Instagram Video';
      const thumb = window.App.Util.extractMetaTag(html, 'og:image') || '';
      const author = window.App.Util.parseAuthor(html);

      return { title, thumb, author, formats: unique };
    },
    copyText: async function(text){
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); return true; } catch(e2){ return false; }
        finally { document.body.removeChild(ta); }
      }
    }
  };
})();
