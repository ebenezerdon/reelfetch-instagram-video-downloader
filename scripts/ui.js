(function(){
  // Ensure namespace
  window.App = window.App || {};

  // App state
  const state = {
    current: null,
    loading: false
  };

  function setLoading(isLoading, message){
    state.loading = isLoading;
    if (isLoading) {
      $('#statusRow').removeClass('hidden');
      $('#statusText').text(message || 'Fetching...');
    } else {
      $('#statusRow').addClass('hidden');
    }
  }

  function showError(msg){
    $('#errorRow').removeClass('hidden').find('div').text(msg);
  }
  function hideError(){ $('#errorRow').addClass('hidden').find('div').empty(); }

  function validateUrl(input){
    const normalized = window.App.Util.normalizeUrl(input);
    if (!window.App.Util.isInstagramUrl(normalized)) {
      throw new Error('Please enter a valid Instagram link to a reel, post, or TV video.');
    }
    return normalized;
  }

  function buildFormatItem(fmt, idx){
    const height = fmt.height ? `${fmt.height}p` : '';
    const meta = height ? ` · ${height}` : '';
    const type = fmt.type || 'video/mp4';
    const id = `fmt_${idx}`;
    const label = fmt.label || 'MP4';
    const safeUrl = fmt.url;
    const $el = $(`
      <div class="flex items-center justify-between gap-3 bg-white rounded-xl p-3 border border-sand">
        <div class="min-w-0">
          <div class="text-sm font-semibold">${label}</div>
          <div class="text-xs text-slate truncate">${type}${meta}</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <a href="${safeUrl}" target="_blank" rel="noopener" class="btn-primary">Download</a>
          <button type="button" class="btn-secondary" data-copy="#${id}">Copy link</button>
          <span id="${id}" class="hidden">${safeUrl}</span>
        </div>
      </div>
    `);
    return $el;
  }

  function renderResults(data, sourceUrl){
    if (!data) return;
    state.current = { ...data, url: sourceUrl };

    $('#resultsPanel').removeClass('hidden');
    $('#resultThumb').attr('src', data.thumb || '').toggleClass('skeleton', !data.thumb);
    $('#resultTitle').text(data.title || 'Instagram Video');
    $('#authorBadge').text(data.author || '');
    $('#formatCount').text(`${data.formats.length} format${data.formats.length === 1 ? '' : 's'}`);
    $('#resultLinkWrap').html(`<a class="text-sky underline break-all" href="${sourceUrl}" target="_blank" rel="noopener">${sourceUrl}</a>`);

    const $list = $('#formatList').empty();
    if (data.formats.length === 0) {
      $list.append($(`
        <div class="text-sm text-slate">
          Direct video URLs were not found for this post. The account may be private or the post is restricted.
          <div class="mt-2 flex flex-wrap gap-2">
            <a class="btn-secondary" target="_blank" rel="noopener" href="https://snapinsta.app/dl?url=${encodeURIComponent(sourceUrl)}">Try SnapInsta</a>
            <a class="btn-secondary" target="_blank" rel="noopener" href="https://ddinstagram.com/?url=${encodeURIComponent(sourceUrl)}">Try ddinstagram</a>
          </div>
        </div>
      `));
    } else {
      data.formats.forEach((fmt, i) => { $list.append(buildFormatItem(fmt, i)); });
    }

    // Save to history
    window.App.Storage.addHistory({
      url: sourceUrl,
      title: data.title || 'Instagram Video',
      thumb: data.thumb || '',
      author: data.author || ''
    });
    renderHistory();
  }

  function renderHistory(){
    const list = window.App.Storage.getHistory();
    const $wrap = $('#historyList').empty();
    if (!list.length) {
      $('#historyEmpty').removeClass('hidden');
      return;
    }
    $('#historyEmpty').addClass('hidden');
    list.slice(0, 12).forEach(item => {
      const $card = $(`
        <button type="button" class="snap-start shrink-0 w-[180px] text-left bg-white rounded-2xl border border-sand overflow-hidden focus:outline-none focus:ring-2 focus:ring-sky">
          <div class="w-full aspect-video bg-sand overflow-hidden">
            ${item.thumb ? `<img src="${item.thumb}" alt="Preview" class="w-full h-full object-cover">` : ''}
          </div>
          <div class="p-2">
            <div class="text-xs font-semibold truncate">${item.author || 'Instagram'}</div>
            <div class="text-[11px] text-slate line-clamp-2 mt-0.5">${item.title || ''}</div>
          </div>
        </button>
      `);
      $card.on('click', function(){
        $('#urlInput').val(item.url);
        $('#fetchForm').trigger('submit');
      });
      $wrap.append($card);
    });
  }

  function toast(msg){
    const $t = $(`<div class="toast" role="status" aria-live="polite">${msg}</div>`);
    $('body').append($t);
    setTimeout(() => $t.addClass('show'), 10);
    setTimeout(() => { $t.removeClass('show'); setTimeout(() => $t.remove(), 200); }, 2200);
  }

  function tryHeadSize(url){
    // Attempt to fetch headers using a lightweight proxy for size. Optional best-effort.
    // Disabled by default for reliability; can be enabled if needed.
    return Promise.resolve(null);
  }

  function runFetch(url){
    hideError();
    setLoading(true, 'Fetching post...');
    window.App.Net.fetchViaProxy(url)
      .then(function(html){
        setLoading(true, 'Parsing video data...');
        const data = window.App.Util.parseInstagramHTML(html || '');
        setLoading(false);
        renderResults(data, url);
      })
      .catch(function(err){
        setLoading(false);
        showError(err && err.message ? err.message : 'Something went wrong. Please try again.');
      });
  }

  // Public API
  window.App.init = function(){
    // Preload history
    renderHistory();

    // Form submission
    $('#fetchForm').on('submit', function(e){
      e.preventDefault();
      try {
        const input = $('#urlInput').val();
        const normalized = validateUrl(input);
        runFetch(normalized);
      } catch (err) {
        showError(err.message);
      }
    });

    // Copy handlers for dynamic format list
    $(document).on('click', '[data-copy]', async function(){
      const sel = $(this).data('copy');
      const text = $(sel).text();
      const ok = await window.App.Util.copyText(text);
      toast(ok ? 'Link copied' : 'Copy failed');
    });

    // Paste button
    $('#pasteBtn').on('click', async function(){
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          $('#urlInput').val(text);
          $('#fetchForm').trigger('submit');
        } else {
          toast('Clipboard is empty');
        }
      } catch (e) {
        toast('Clipboard not available');
      }
    });

    // Demo button with a known public reel link; if blocked, still demonstrates flow
    $('#demoBtn').on('click', function(){
      const demo = 'https://www.instagram.com/reel/DQbwgmWjJuZ';
      $('#urlInput').val(demo);
      $('#fetchForm').trigger('submit');
    });

    // History clear
    $('#clearHistory').on('click', function(){
      window.App.Storage.clearHistory();
      renderHistory();
    });

    // Help modal
    $('#openHelp').on('click', function(e){ e.preventDefault(); $('#helpModal').removeClass('hidden').addClass('flex'); });
    $('#closeHelp').on('click', function(){ $('#helpModal').addClass('hidden').removeClass('flex'); });
    $('#helpModal').on('click', function(e){ if (e.target === this) { $('#helpModal').addClass('hidden').removeClass('flex'); } });

    // Paste to auto-submit
    $('#urlInput').on('paste', function(){ setTimeout(() => { const v = $('#urlInput').val(); if (v && window.App.Util.isInstagramUrl(window.App.Util.normalizeUrl(v))) { $('#fetchForm').trigger('submit'); } }, 30); });
  };

  window.App.render = function(){
    // No-op initial render beyond history; keep for contract compliance.
  };
})();
