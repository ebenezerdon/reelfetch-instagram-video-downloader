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
      const timeoutMs = opts.timeout || 18000;
      // Try multiple CORS-friendly proxies sequentially for reliability
      const targets = [
        {
          name: 'allorigins-json',
          build: (u) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u),
          dataType: 'json',
          transform: (res) => (res && res.contents) || ''
        },
        {
          name: 'isomorphic-git',
          build: (u) => 'https://cors.isomorphic-git.org/' + u,
          dataType: 'text'
        },
        {
          name: 'allorigins-raw',
          build: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
          dataType: 'text'
        },
        {
          name: 'jina-reader',
          // Jina reader proxy (works for many HTML pages and sends permissive CORS)
          build: (u) => 'https://r.jina.ai/http://' + String(u).replace(/^https?:\/\//i, ''),
          dataType: 'text'
        }
      ];

      return new Promise(function(resolve, reject){
        let lastErr = null;
        const tryNext = function(i){
          if (i >= targets.length) {
            reject(lastErr || new Error('All proxy attempts failed'));
            return;
          }
          const t = targets[i];
          const reqUrl = t.build(url);
          let xhr;
          const timer = setTimeout(function(){
            try { if (xhr) xhr.abort(); } catch (e) {}
            lastErr = new Error('Timeout via ' + t.name);
            tryNext(i + 1);
          }, timeoutMs);

          xhr = $.ajax({ url: reqUrl, method: 'GET', dataType: t.dataType || 'text' })
            .done(function(res){
              clearTimeout(timer);
              try {
                const html = t.transform ? t.transform(res) : res;
                if (!html || typeof html !== 'string' || html.length < 50) {
                  // Treat very small responses as failures for our parser
                  throw new Error('Empty or invalid response via ' + t.name);
                }
                resolve(html);
              } catch (e) {
                lastErr = e;
                tryNext(i + 1);
              }
            })
            .fail(function(xhr){
              clearTimeout(timer);
              lastErr = new Error('Fetch failed via ' + t.name + (xhr && xhr.status ? (' (' + xhr.status + ')') : ''));
              tryNext(i + 1);
            });
        };
        tryNext(0);
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
