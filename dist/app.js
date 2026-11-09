/* A vocabulary study app based on the user's supplied PDF. No API keys stored. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'qingsongji-pronunciation-v1';
  const PAGE_SIZE = 70;
  const icon = {
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linejoin="round" aria-hidden="true"><path d="m12 2.5 3 6.2 6.9 1-5 4.8 1.2 6.8L12 18.1l-6.1 3.2 1.2-6.8-5-4.8 6.9-1 3-6.2Z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>',
  };

  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  const saved = loadSaved();
  const state = {
    words: [],
    byId: new Map(),
    selected: typeof saved.selected === 'number' || ['all', 'favorites'].includes(saved.selected) ? saved.selected : 1,
    filter: ['all', 'mastered', 'unmastered'].includes(saved.filter) ? saved.filter : 'all',
    accent: saved.accent === 'uk' ? 'uk' : 'us',
    speed: saved.speed === 'slow' ? 'slow' : 'normal',
    hideMeaning: Boolean(saved.hideMeaning),
    mastered: new Set(Array.isArray(saved.mastered) ? saved.mastered : []),
    favorites: new Set(Array.isArray(saved.favorites) ? saved.favorites : []),
    query: '', renderLimit: PAGE_SIZE, results: [], playingId: null, sequenceEnabled: false,
  };
  let activeAudio = null;
  let activeUtterance = null;
  let playbackToken = 0;
  let audioTimeout = null;
  let baiduUnavailable = false;
  let speechUnavailable = false;
  let toastTimeout = null;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selected: state.selected, filter: state.filter, accent: state.accent,
        speed: state.speed, hideMeaning: state.hideMeaning,
        mastered: Array.from(state.mastered), favorites: Array.from(state.favorites),
      }));
    } catch { /* An in-private browser may disable localStorage. */ }
  }

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function setAudioStatus(text) { $('audioStatus').textContent = text; }
  function baiduAudioUrl(word) {
    const language = state.accent === 'uk' ? 'en-GB' : 'en';
    const speed = state.speed === 'slow' ? '3' : '5';
    return `https://fanyi.baidu.com/gettts?lan=${language}&text=${encodeURIComponent(word.speech)}&spd=${speed}&source=web`;
  }
  function baiduDictionaryUrl(word) {
    return `https://fanyi.baidu.com/mtpe-individual/multimodal?query=${encodeURIComponent(word.speech)}&lang=en2zh`;
  }

  function filteredWords() {
    let result = state.words;
    if (state.query) {
      const q = state.query.toLocaleLowerCase();
      result = result.filter(w => w.word.toLocaleLowerCase().includes(q) || w.meaning.toLocaleLowerCase().includes(q));
    } else if (state.selected === 'favorites') {
      result = result.filter(w => state.favorites.has(w.id));
    } else if (typeof state.selected === 'number') {
      result = result.filter(w => w.list === state.selected);
    }
    if (state.filter === 'mastered') result = result.filter(w => state.mastered.has(w.id));
    if (state.filter === 'unmastered') result = result.filter(w => !state.mastered.has(w.id));
    return result;
  }

  function createWordCard(word) {
    const card = document.createElement('article');
    card.className = 'word-card';
    card.dataset.id = word.id;
    if (state.mastered.has(word.id)) card.classList.add('is-mastered');
    if (state.hideMeaning) card.classList.add('meaning-hidden');
    if (state.playingId === word.id) card.classList.add('is-playing');
    card.innerHTML = `
      <div class="word-index"></div>
      <div class="word-details">
        <div class="word-headline"><span class="word-en"></span><span class="word-ipa" title="自动生成的美式参考音标，并非百度官方音标"></span><span class="word-accent"></span></div>
        <div class="word-meaning" tabindex="0"></div>
      </div>
      <div class="word-actions">
        <button type="button" class="small-action favorite-action" data-action="favorite" aria-label="收藏单词">${icon.star}</button>
        <button type="button" class="small-action mastered-action" data-action="mastered" aria-label="标为已掌握">${icon.check}</button>
        <a class="baidu-link" target="_blank" rel="noopener noreferrer" title="在百度翻译查看该词">百度 ↗</a>
        <button type="button" class="play-word" data-action="play" aria-label="播放单词发音">${icon.volume}<span>发音</span></button>
      </div>`;
    card.querySelector('.word-index').textContent = String(word.number).padStart(2, '0');
    card.querySelector('.word-en').textContent = word.word;
    card.querySelector('.word-ipa').textContent = word.ipa_us ? `/${word.ipa_us}/` : '音标待补';
    card.querySelector('.word-ipa').setAttribute('aria-label', `美式参考音标：${word.ipa_us || '待补充'}`);
    card.querySelector('.word-accent').textContent = state.accent === 'uk' ? 'UK' : 'US';
    card.querySelector('.word-meaning').textContent = word.meaning || '（原书未提供释义）';
    card.querySelector('.baidu-link').href = baiduDictionaryUrl(word);
    const fav = card.querySelector('.favorite-action');
    fav.classList.toggle('is-favorite', state.favorites.has(word.id));
    fav.setAttribute('aria-pressed', String(state.favorites.has(word.id)));
    fav.setAttribute('aria-label', state.favorites.has(word.id) ? '取消收藏' : '收藏单词');
    const mastered = card.querySelector('.mastered-action');
    mastered.classList.toggle('is-mastered', state.mastered.has(word.id));
    mastered.setAttribute('aria-pressed', String(state.mastered.has(word.id)));
    mastered.setAttribute('aria-label', state.mastered.has(word.id) ? '标为未掌握' : '标为已掌握');
    return card;
  }

  function renderListNav() {
    const counts = new Map();
    for (const word of state.words) counts.set(word.list, (counts.get(word.list) || 0) + 1);
    const root = $('listNav');
    root.replaceChildren();
    for (let listNumber = 1; listNumber <= 30; listNumber++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'list-button';
      button.dataset.select = String(listNumber);
      button.innerHTML = `<span class="list-number"></span><span class="list-count"></span>`;
      button.querySelector('.list-number').textContent = `List ${String(listNumber).padStart(2, '0')}`;
      button.querySelector('.list-count').textContent = counts.get(listNumber) || 0;
      root.appendChild(button);
    }
    updateNavigation();
  }

  function updateNavigation() {
    document.querySelectorAll('[data-select]').forEach(el => {
      const selection = el.dataset.select;
      const active = !state.query && (selection === String(state.selected));
      el.classList.toggle('is-active', active);
      el.setAttribute('aria-current', active ? 'page' : 'false');
    });
    $('allNavCount').textContent = state.words.length;
    $('favoriteNavCount').textContent = state.favorites.size;
  }

  function updateProgress() {
    const knownIds = state.byId;
    const count = Array.from(state.mastered).filter(id => knownIds.has(id)).length;
    const pct = state.words.length ? Math.round(count / state.words.length * 100) : 0;
    $('progressFraction').textContent = `${count} / ${state.words.length}`;
    $('progressPercent').textContent = `${pct}%`;
    $('progressFill').style.width = `${pct}%`;
    $('favoriteNavCount').textContent = state.favorites.size;
  }

  function updateSettingsUI() {
    document.querySelectorAll('[data-accent]').forEach(button => {
      const isActive = button.dataset.accent === state.accent;
      button.classList.toggle('is-selected', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    $('speedSelect').value = state.speed;
    $('meaningLabel').textContent = state.hideMeaning ? '显示释义' : '隐藏释义';
    $('meaningIcon').textContent = state.hideMeaning ? '◌' : '◉';
    $('toggleMeaning').setAttribute('aria-pressed', String(state.hideMeaning));
    document.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    updateSequenceButton();
  }

  function updateSequenceButton() {
    $('sequenceButton').classList.toggle('is-playing', state.sequenceEnabled);
    $('sequenceIcon').textContent = state.sequenceEnabled ? '■' : '▶';
    $('sequenceLabel').textContent = state.sequenceEnabled ? '停止播放' : '顺序播放';
    $('sequenceButton').setAttribute('aria-pressed', String(state.sequenceEnabled));
  }

  function renderWords() {
    state.results = filteredWords();
    let title;
    if (state.query) title = '搜索结果';
    else if (state.selected === 'all') title = '全部单词';
    else if (state.selected === 'favorites') title = '我的收藏';
    else title = `List ${String(state.selected).padStart(2, '0')}`;
    $('sectionTitle').textContent = title;
    $('sectionEyebrow').textContent = state.query ? 'SEARCH RESULTS' : 'YOUR VOCABULARY';
    $('resultCount').textContent = `${state.results.length} 个词条`;
    updateNavigation();
    updateProgress();
    updateSettingsUI();

    const root = $('wordsContainer');
    if (!state.results.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-illustration">✳</div><strong>还没有匹配的单词</strong><p>换个关键词，或调整列表与掌握状态试试。</p>';
      root.replaceChildren(empty);
      $('loadmoreWrap').hidden = true;
      return;
    }
    const displayed = state.results.slice(0, state.renderLimit);
    const fragment = document.createDocumentFragment();
    for (const word of displayed) fragment.appendChild(createWordCard(word));
    root.replaceChildren(fragment);
    $('loadmoreWrap').hidden = displayed.length >= state.results.length;
    $('loadMoreButton').textContent = `再显示 ${Math.min(PAGE_SIZE, state.results.length - displayed.length)} 个单词 ↓`;
    updatePlaybackUI();
  }

  function updatePlaybackUI() {
    const playingId = state.playingId;
    document.querySelectorAll('.word-card').forEach(card => {
      const active = card.dataset.id === playingId;
      card.classList.toggle('is-playing', active);
      const button = card.querySelector('.play-word');
      button.querySelector('span').textContent = active ? '播放中' : '发音';
      button.setAttribute('aria-label', active ? '停止当前发音' : '播放单词发音');
    });
    updateSequenceButton();
  }

  function stopPlayback({ keepSequence = false } = {}) {
    playbackToken += 1;
    clearTimeout(audioTimeout);
    audioTimeout = null;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute('src');
      activeAudio = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    activeUtterance = null;
    state.playingId = null;
    if (!keepSequence) state.sequenceEnabled = false;
    updatePlaybackUI();
  }

  function finishWord(token) {
    if (token !== playbackToken) return;
    if (state.sequenceEnabled) {
      const index = state.results.findIndex(word => word.id === state.playingId);
      if (index !== -1 && index + 1 < state.results.length) {
        const next = state.results[index + 1];
        if (index + 2 > state.renderLimit) {
          state.renderLimit = index + 2;
          renderWords();
        }
        setTimeout(() => {
          if (token !== playbackToken || !state.sequenceEnabled) return;
          playWord(next);
          const card = document.querySelector(`[data-id="${next.id}"]`);
          if (card && !isInViewport(card)) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 220);
        return;
      }
      toast('当前词表已全部播放完毕！');
    }
    stopPlayback();
    setAudioStatus('点击喇叭，继续听单词');
  }

  function isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return rect.top >= 70 && rect.bottom <= window.innerHeight - 15;
  }

  function fallbackOffline(word, token) {
    if (token !== playbackToken) return;
    if (activeUtterance) {
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    const offline = new Audio(`./audio/us/${encodeURIComponent(word.id)}.mp3`);
    activeAudio = offline;
    offline.addEventListener('playing', () => {
      if (token === playbackToken) setAudioStatus('正在播放：离线备用美音（CMU Flite 合成，非百度）');
    });
    offline.addEventListener('ended', () => finishWord(token));
    offline.addEventListener('error', () => {
      if (token !== playbackToken) return;
      stopPlayback();
      setAudioStatus('备用音频加载失败，请点击「百度」在词典中试听');
    });
    setAudioStatus('正在载入离线备用发音…');
    const promise = offline.play();
    if (promise?.catch) promise.catch(() => {
      if (token !== playbackToken) return;
      stopPlayback();
      setAudioStatus('浏览器阻止了自动续播，请再次点击「发音」');
    });
  }

  function fallbackVoice(word, token) {
    if (token !== playbackToken) return;
    baiduUnavailable = true; // Avoid a 6-second failed Baidu request on every later word.
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute('src');
      activeAudio = null;
    }
    clearTimeout(audioTimeout);
    audioTimeout = null;

    if (speechUnavailable || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      speechUnavailable = true;
      fallbackOffline(word, token);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(word.speech);
    const desiredLang = state.accent === 'uk' ? 'en-GB' : 'en-US';
    utterance.lang = desiredLang;
    utterance.rate = state.speed === 'slow' ? 0.72 : 0.94;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase() === desiredLang.toLowerCase())
      || voices.find(v => v.lang.toLowerCase().startsWith('en'));
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (token === playbackToken) setAudioStatus(`正在播放：设备语音（${state.accent === 'uk' ? '英音' : '美音'}，百度直连不可用）`);
    };
    utterance.onend = () => finishWord(token);
    utterance.onerror = () => {
      if (token === playbackToken) {
        speechUnavailable = true;
        fallbackOffline(word, token);
      }
    };
    activeUtterance = utterance;
    setAudioStatus('百度音频无法直连，正在使用设备语音…');
    window.speechSynthesis.speak(utterance);
  }

  function playWord(word) {
    stopPlayback({ keepSequence: true });
    const token = playbackToken;
    state.playingId = word.id;
    updatePlaybackUI();
    if (baiduUnavailable) {
      fallbackVoice(word, token);
      return;
    }
    const audio = new Audio();
    activeAudio = audio;
    let fallbackStarted = false;
    const useFallback = () => {
      if (fallbackStarted || token !== playbackToken) return;
      fallbackStarted = true;
      fallbackVoice(word, token);
    };
    audio.addEventListener('playing', () => {
      if (token !== playbackToken) return;
      clearTimeout(audioTimeout);
      audioTimeout = null;
      setAudioStatus(`正在播放：百度翻译音频 · ${state.accent === 'uk' ? '英音' : '美音'}`);
    });
    audio.addEventListener('ended', () => finishWord(token));
    audio.addEventListener('error', useFallback);
    audio.src = baiduAudioUrl(word);
    audio.preload = 'auto';
    setAudioStatus('正在连接百度发音…');
    audioTimeout = setTimeout(useFallback, 6500);
    try {
      const playPromise = audio.play();
      if (playPromise?.catch) playPromise.catch(useFallback);
    } catch { useFallback(); }
  }

  function selectList(value) {
    stopPlayback();
    state.selected = value === 'all' || value === 'favorites' ? value : Number(value);
    state.query = '';
    $('searchInput').value = '';
    state.renderLimit = PAGE_SIZE;
    save();
    renderWords();
    if (window.innerWidth < 881) $('sectionTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindEvents() {
    document.addEventListener('click', e => {
      const select = e.target.closest('[data-select]');
      if (select) { selectList(select.dataset.select); return; }
      const actionButton = e.target.closest('[data-action]');
      if (!actionButton) return;
      const card = actionButton.closest('[data-id]');
      if (!card) return;
      const word = state.byId.get(card.dataset.id);
      if (!word) return;
      const action = actionButton.dataset.action;
      if (action === 'play') {
        if (state.playingId === word.id) {
          stopPlayback(); setAudioStatus('播放已停止');
        } else playWord(word);
      } else if (action === 'favorite') {
        if (state.favorites.has(word.id)) state.favorites.delete(word.id);
        else state.favorites.add(word.id);
        save(); renderWords();
        toast(state.favorites.has(word.id) ? `已收藏 ${word.word}` : `已取消收藏 ${word.word}`);
      } else if (action === 'mastered') {
        if (state.mastered.has(word.id)) state.mastered.delete(word.id);
        else state.mastered.add(word.id);
        save(); renderWords();
        toast(state.mastered.has(word.id) ? `${word.word} · 已掌握 ✓` : `${word.word} · 已移回待掌握`);
      }
    });

    $('searchInput').addEventListener('input', e => {
      stopPlayback();
      state.query = e.target.value.trim();
      state.renderLimit = PAGE_SIZE;
      renderWords();
    });
    document.querySelectorAll('[data-accent]').forEach(button => button.addEventListener('click', () => {
      stopPlayback();
      state.accent = button.dataset.accent;
      save(); renderWords();
      setAudioStatus(`已切换到${state.accent === 'uk' ? '英音' : '美音'}，点击单词试听`);
    }));
    $('speedSelect').addEventListener('change', e => {
      stopPlayback(); state.speed = e.target.value; save(); updateSettingsUI();
      setAudioStatus(`语速已改为${state.speed === 'slow' ? '慢速' : '正常'}`);
    });
    document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
      stopPlayback(); state.filter = button.dataset.filter; state.renderLimit = PAGE_SIZE;
      save(); renderWords();
    }));
    $('toggleMeaning').addEventListener('click', () => {
      state.hideMeaning = !state.hideMeaning; save(); updateSettingsUI();
      document.querySelectorAll('.word-card').forEach(card => card.classList.toggle('meaning-hidden', state.hideMeaning));
    });
    $('loadMoreButton').addEventListener('click', () => {
      state.renderLimit += PAGE_SIZE;
      renderWords();
    });
    $('sequenceButton').addEventListener('click', () => {
      if (state.sequenceEnabled) {
        stopPlayback(); setAudioStatus('顺序播放已停止'); return;
      }
      if (!state.results.length) { toast('当前列表没有可以播放的单词'); return; }
      state.sequenceEnabled = true;
      updateSequenceButton();
      playWord(state.results[0]);
    });
    const dialog = $('helpDialog');
    $('helpButton').addEventListener('click', () => dialog.showModal());
    $('closeHelp').addEventListener('click', () => dialog.close());
    $('doneHelp').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    document.addEventListener('keydown', event => {
      const tag = document.activeElement?.tagName;
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        event.preventDefault(); $('searchInput').focus();
      }
      if (event.key === 'Escape' && state.sequenceEnabled && !dialog.open) {
        stopPlayback(); setAudioStatus('顺序播放已停止');
      }
    });
  }

  async function start() {
    bindEvents();
    try {
      const response = await fetch('./vocab.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const words = await response.json();
      if (!Array.isArray(words) || words.length < 100) throw new Error('词库内容不完整');
      state.words = words;
      state.byId = new Map(words.map(word => [word.id, word]));
      $('heroTotal').textContent = words.length.toLocaleString('zh-CN');
      state.mastered = new Set([...state.mastered].filter(id => state.byId.has(id)));
      state.favorites = new Set([...state.favorites].filter(id => state.byId.has(id)));
      renderListNav();
      renderWords();
    } catch (error) {
      $('wordsContainer').innerHTML = `<div class="empty-state"><div class="empty-illustration">!</div><strong>词库暂时没能加载</strong><p>请检查网络后刷新页面。</p></div>`;
      $('resultCount').textContent = '加载失败';
      setAudioStatus('词库读取失败');
      console.error('Vocabulary load failed:', error);
    }
  }

  start();
})();
