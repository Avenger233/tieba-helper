// ==UserScript==
// @name         贴吧助手（旧版/新版各自生效）
// @namespace    https://github.com/shitianshiwa/baidu-tieba-userscript
// @updateURL    https://jb.tsgz.xyz/tieba-helper.user.js
// @downloadURL  https://jb.tsgz.xyz/tieba-helper.user.js
// @homepageURL  https://jb.tsgz.xyz/
// @version      0.8.2
// @description  同一个脚本，两套功能：旧版页面跑旧版那套（去广告、屏蔽楼层气泡、隐藏印记、去彩名、挽尊卡、跳转解除、楼中楼展开、图片查看器、直接显示大图、客户端排序…），新版页面跑新版那套（去推广、隐藏视频帖、默认最新、内置查看器滚轮切图…）。不处理免登录看贴。
// @author       lead
// @match        https://tieba.baidu.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================
   * 0. 页面识别
   * ========================================================= */
  const MARK_OLD = ['.j_thread_list', '#j_p_postlist', '.threadlist_title', '.forumpage', '.core_title_wrap_bright'];
  const MARK_NEW = ['.left-nav-wrapper', '.virtual-list-item', '.post-content', '.card-tab', '.frs-right-sidebar'];
  const has = (s) => !!document.querySelector(s);
  const detect = () => (MARK_OLD.some(has) ? 'old' : MARK_NEW.some(has) ? 'new' : null);

  let PAGE = null;
  let AD = null;
  let FEATURES = [];

  /* =========================================================
   * 1. 适配器
   * ========================================================= */
  const A = {
    old: {
      item: '.j_thread_list:not(.thread_top)',
      title: '.j_th_tit, .threadlist_title a',
      author: '.frs-author-name',
      post: '.l_post',
      postAuthor: '.p_author_name, .d_name a',
      dockSide: 'left',
      bigImg: '.d_post_content img.BDE_Image',
      expandSel: '.lzl_more, a.lzl_more'
    },
    new: {
      item: '.virtual-list-item',
      title: '.list-title',
      author: '.forum-name',
      post: '.post-content, .pb-content-item',
      postAuthor: '[class*="author"]',
      dockSide: 'right',
      bigImg: null,
      expandSel: 'button, [class*="expand"], [class*="more"]',
      viewer: '.el-image-viewer__wrapper',
      viewerNext: '.el-image-viewer__next',
      viewerPrev: '.el-image-viewer__prev',
      tabForum: '.card-tab .tab-item',
      tabThread: '.sub-tab-container .sub-tab-item',
      activeThread: '.sub-tab-item-active',
      forumText: '最新',
      threadText: '正序'
    }
  };

  function authorOfOldLi(li) {
    const df = li.getAttribute && li.getAttribute('data-field');
    if (!df) return '';
    try {
      const j = JSON.parse(df.replace(/'/g, '"'));
      return j.author_name || j.author || '';
    } catch (e) { return ''; }
  }
  const authorOf = (el) => {
    if (!el || !AD) return '';
    const n = el.querySelector(AD.author);
    if (n) return (n.textContent || '').trim();
    return PAGE === 'old' ? authorOfOldLi(el) : '';
  };

  /* =========================================================
   * 2. 工具
   * ========================================================= */
  const $all = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const txt = (el, sel) => { const n = sel && el.querySelector(sel); return n ? (n.textContent || '').trim() : ''; };
  const lines = (s) => (s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function scroller() {
    if (PAGE === 'old') return document.scrollingElement || document.documentElement;
    const start = document.querySelector('.virtual-list-item') || document.querySelector('.post-content') || document.body;
    let el = start;
    while (el && el !== document.body) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 40) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function scrollToY(top) {
    const el = scroller();
    if (el === document.scrollingElement || el === document.documentElement) window.scrollTo({ top: top, behavior: 'smooth' });
    else el.scrollTo({ top: top, behavior: 'smooth' });
  }

  /* =========================================================
   * 3. 图片查看器（旧版专用完整版）
   *    单击开图 · 滚轮切图 · Ctrl+滚轮缩放 · 拖拽移动 · 双击/R/Esc 关闭 · ←→ 跨楼 · +/- 缩放 · R 旋转
   * ========================================================= */
  const V = { el: null, img: null, list: [], idx: 0, scale: 1, rot: 0, x: 0, y: 0, drag: null, moved: 0 };
  const bigSrc = (u) => (u || '')
    .replace('tiebapic.baidu.com/forum/pic/item/', 'imgsrc.baidu.com/forum/pic/item/')
    .replace(/\/forum\/w%3D\d+[^/]*\//, '/forum/pic/item/');

  function vApply() {
    if (!V.img) return;
    V.img.style.transform = 'translate(' + V.x + 'px,' + V.y + 'px) scale(' + V.scale + ') rotate(' + V.rot + 'deg)';
  }
  function vReset() { V.scale = 1; V.rot = 0; V.x = 0; V.y = 0; vApply(); }
  function vZoom(f) { V.scale = clamp(V.scale * f, 0.2, 8); vApply(); }

  function vClose() {
    if (V.el) V.el.remove();
    V.el = null; V.img = null; V.list = []; V.drag = null;
  }

  function vShow(i) {
    if (!V.el || !V.list.length) return;
    V.idx = (i + V.list.length) % V.list.length;
    V.img.src = V.list[V.idx];
    vReset();
    V.el.querySelector('.tbna-cnt').textContent = (V.idx + 1) + ' / ' + V.list.length;
  }

  function vOpen(list, idx) {
    vClose();
    if (!list.length) return;
    V.list = list;
    V.el = document.createElement('div');
    V.el.className = 'tbna-viewer';
    V.el.innerHTML =
      '<img alt="">' +
      '<div class="tbna-bar"><span class="tbna-cnt"></span>' +
      '<button data-a="out" title="缩小">−</button>' +
      '<button data-a="reset" title="原始大小">⊙</button>' +
      '<button data-a="in" title="放大">+</button>' +
      '<button data-a="rot" title="旋转">↻</button>' +
      '<button data-a="prev" title="上一张">◀</button>' +
      '<button data-a="next" title="下一张">▶</button>' +
      '<button data-a="close" title="关闭">✕</button></div>';
    V.img = V.el.querySelector('img');
    V.el.addEventListener('mousedown', function (e) { if (e.target === V.el) V.moved = 0; });
    V.el.addEventListener('click', function (e) {
      const b = e.target.closest('button');
      if (b) {
        const a = b.getAttribute('data-a');
        if (a === 'in') vZoom(1.25);
        else if (a === 'out') vZoom(0.8);
        else if (a === 'reset') vReset();
        else if (a === 'rot') { V.rot = (V.rot + 90) % 360; vApply(); }
        else if (a === 'prev') vShow(V.idx - 1);
        else if (a === 'next') vShow(V.idx + 1);
        else vClose();
        return;
      }
      if (e.target === V.el && V.moved < 5) vClose();
    });
    V.img.addEventListener('mousedown', function (e) {
      e.preventDefault();
      V.drag = { x: e.clientX, y: e.clientY, ox: V.x, oy: V.y };
      V.moved = 0;
    });
    addEventListener('mousemove', vMove);
    addEventListener('mouseup', vUp);
    document.body.appendChild(V.el);
    vShow(idx);
  }
  function vMove(e) {
    if (!V.drag) return;
    const dx = e.clientX - V.drag.x, dy = e.clientY - V.drag.y;
    V.moved = Math.abs(dx) + Math.abs(dy);
    V.x = V.drag.ox + dx;
    V.y = V.drag.oy + dy;
    vApply();
  }
  function vUp() { V.drag = null; }

  /* =========================================================
   * 3.5 签到（关注的全部吧 · tbs + md5 签名）
   * ========================================================= */
  const SIGN_DATE = 'signDate';
  const signState = { running: false, tried: false };

  function md5(input) {
    const SH = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const KK = [];
    for (let i = 0; i < 64; i++) KK[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
    const bytes = [];
    const s = String(input);
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        const c2 = s.charCodeAt(++i);
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 0; i < 4; i++) bytes.push((bitLen >>> (8 * i)) & 0xff);
    for (let i = 0; i < 4; i++) bytes.push(Math.floor(bitLen / 4294967296) >>> (8 * i) & 0xff);

    const rotl = (x, n) => (x << n) | (x >>> (32 - n));
    const M = new Array(16);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let off = 0; off < bytes.length; off += 64) {
      for (let i = 0; i < 16; i++) {
        const p = off + i * 4;
        M[i] = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24);
      }
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + KK[i] + M[g]) | 0;
        A = D; D = C; C = B;
        B = (B + rotl(F, SH[i])) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    const hex = (x) => {
      let o = '';
      for (let i = 0; i < 4; i++) {
        const b = (x >>> (8 * i)) & 0xff;
        o += (b < 16 ? '0' : '') + b.toString(16);
      }
      return o;
    };
    return hex(a0) + hex(b0) + hex(c0) + hex(d0);
  }

  function tbReq(opt) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: opt.method || 'GET',
        url: opt.url,
        headers: opt.headers || {},
        data: opt.data,
        timeout: 15000,
        onload: resolve,
        onerror: function () { reject(new Error('网络错误')); },
        ontimeout: function () { reject(new Error('超时')); }
      });
    });
  }

  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const sleep = (ms) => new Promise(function (r) { setTimeout(r, ms); });

  let toastEl = null, toastTimer = null;
  function toast(msg, sticky) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'tbna-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    if (toastTimer) clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(function () { if (toastEl) { toastEl.remove(); toastEl = null; } }, 7000);
  }

  async function fetchTbs() {
    const r = await tbReq({ url: 'https://tieba.baidu.com/dc/common/tbs' });
    const j = JSON.parse(r.responseText);
    if (j.is_login !== 1) throw new Error('未登录');
    return j.tbs;
  }

  async function fetchUnsigned() {
    const r = await tbReq({ url: 'https://tieba.baidu.com/mo/q/newmoindex' });
    const j = JSON.parse(r.responseText);
    if (j.no !== 0) throw new Error('取关注列表失败');
    const out = { signed: [], unsigned: [] };
    (j.data.like_forum || []).forEach(function (x) {
      (x.is_sign === 1 ? out.signed : out.unsigned).push(x.forum_name);
    });
    return out;
  }

  async function signOne(name, tbs) {
    const sign = md5('kw=' + name + 'tbs=' + tbs + 'tiebaclient!!!');
    const r = await tbReq({
      method: 'POST',
      url: 'https://c.tieba.baidu.com/c/c/forum/sign',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: 'kw=' + encodeURIComponent(name) + '&tbs=' + tbs + '&sign=' + sign
    });
    const j = JSON.parse(r.responseText);
    return j.error_code === '0' || j.error_code === 0 || j.error_code === '160002' || j.error_code === 160002;
  }

  async function startSign() {
    if (signState.running) return;
    signState.running = true;
    let ok = 0;
    const fail = [];
    try {
      toast('正在获取关注列表…', true);
      const tbs = await fetchTbs();
      const list = await fetchUnsigned();
      if (!list.unsigned.length) {
        save(SIGN_DATE, todayStr());
        toast('关注的吧今天都已签到过');
        return;
      }
      for (let i = 0; i < list.unsigned.length; i++) {
        const name = list.unsigned[i];
        toast('签到 ' + (i + 1) + '/' + list.unsigned.length + '：' + name, true);
        let good = false;
        try { good = await signOne(name, tbs); } catch (e) { good = false; }
        if (good) ok++; else fail.push(name);
        await sleep(800 + Math.floor(Math.random() * 700));
      }
      const retry = fail.slice();
      fail.length = 0;
      for (let i = 0; i < retry.length; i++) {
        let good = false;
        try { good = await signOne(retry[i], tbs); } catch (e) { good = false; }
        if (good) ok++; else fail.push(retry[i]);
        await sleep(1000);
      }
      save(SIGN_DATE, todayStr());
      toast('签到完成：成功 ' + ok + ' 个，失败 ' + fail.length + (fail.length ? '（' + fail.slice(0, 5).join('、') + '…）' : ''));
    } catch (e) {
      toast('签到失败：' + (e && e.message ? e.message : e));
    } finally {
      signState.running = false;
    }
  }

  function autoSignOnce() {
    if (!S.signAuto || signState.tried) return;
    signState.tried = true;
    if (S.signOncePerDay && GM_getValue(K + SIGN_DATE, '') === todayStr()) return;
    setTimeout(startSign, 1500);
  }

  function mountSign() {
    const dock = document.querySelector('.tbna-dock');
    if (!dock || dock.querySelector('button[title="签到"]')) return;
    const b = mkBtn('签到关注的所有吧', '签', function () { startSign(); });
    const before = dock.querySelector('button[title="设置"]');
    if (before) dock.insertBefore(b, before); else dock.appendChild(b);
  }

  /* =========================================================
   * 3.6 引用楼层
   * ========================================================= */
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function quoteText(post) {
    const floor = $all(AD.post).indexOf(post) + 1;
    const author = authorOf(post) || '匿名';
    const body = post.querySelector(PAGE === 'old' ? '.d_post_content' : '.post-content') || post;
    const content = (body.innerText || '').replace(/\n{2,}/g, '\n').trim().slice(0, 300);
    return '【引用 ' + floor + ' 楼 · ' + author + '】\n' + content + '\n\n';
  }

  function findEditor() {
    const ifr = document.querySelector('#ueditor_0');
    if (ifr && ifr.contentDocument && ifr.contentDocument.body) return ifr.contentDocument.body;
    const ce = document.querySelector('#ueditor_replace, .edui-body-container[contenteditable="true"], [contenteditable="true"][class*="editor"]');
    if (ce) return ce;
    return document.querySelector('.el-textarea__inner, textarea[class*="editor"], textarea[id*="post"], textarea') || null;
  }

  function insertQuote(text) {
    const ed = findEditor();
    if (!ed) {
      try { navigator.clipboard.writeText(text); } catch (e) { }
      toast('没找到回复框，已复制到剪贴板');
      return;
    }
    ed.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (ed.tagName === 'TEXTAREA' || ed.tagName === 'INPUT') {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ed), 'value');
      const v = (ed.value ? ed.value + '\n' : '') + text;
      if (set && set.set) set.set.call(ed, v); else ed.value = v;
      ed.dispatchEvent(new Event('input', { bubbles: true }));
      ed.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      ed.focus();
      const html = text.split('\n').filter(function (l) { return l.trim(); })
        .map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
      document.execCommand('insertHTML', false, html);
      if (!ed.innerHTML) ed.innerHTML = html;
    }
    toast('已插入引用');
  }

  function bindQuote() {
    document.addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('.tbna-quote, .tbna-qbtn');
      if (!a) return;
      e.preventDefault();
      e.stopPropagation();
      const post = a.closest(AD.post);
      if (post) insertQuote(quoteText(post));
    }, true);
  }

  function sweepQuoteOld() {
    $all('.l_post').forEach(function (p) {
      if (p.querySelector('.tbna-quote')) return;
      const tail = p.querySelector('.post-tail-wrap');
      if (!tail) return;
      const li = document.createElement('li');
      li.className = 'pad-left';
      const a = document.createElement('a');
      a.className = 'tbna-quote';
      a.textContent = '#引用';
      li.appendChild(a);
      tail.insertBefore(li, tail.firstChild);
    });
  }

  function sweepQuoteNew() {
    $all('.post-content').forEach(function (p) {
      if (p.querySelector('.tbna-qbtn')) return;
      const holder = p.querySelector('[class*="header"]') || p;
      const b = document.createElement('button');
      b.className = 'tbna-qbtn';
      b.textContent = '引用';
      holder.appendChild(b);
    });
  }

  /* =========================================================
   * 4. 通用功能
   * ========================================================= */
  const SHARED = [
    {
      id: 'block', label: '关键字 / 用户屏蔽', def: true,
      sweep: function () {
        const kw = lines(S.keywords), us = lines(S.users);
        if (!kw.length && !us.length) return;
        $all(AD.item).forEach(function (li) {
          if (li.dataset.tbnaShot === '1') return;
          const title = txt(li, AD.title) || li.textContent || '';
          const au = authorOf(li);
          li.dataset.tbnaShot = '1';
          if (kw.some(function (k) { return title.indexOf(k) >= 0; }) || us.some(function (u) { return au && au.indexOf(u) >= 0; })) li.classList.add('tbna-hidden');
        });
        $all(AD.post).forEach(function (p) {
          if (p.dataset.tbnaShot === '1') return;
          const au = authorOf(p);
          p.dataset.tbnaShot = '1';
          if (us.some(function (u) { return au && au.indexOf(u) >= 0; })) p.classList.add('tbna-hidden');
        });
      }
    },
    {
      id: 'unshorten', label: '解除外链跳转', def: true,
      sweep: function () {
        $all('a[href]').forEach(function (a) {
          if (a.dataset.tbnaUrl === '1' || !/jump2?\.bdimg\.com\//.test(a.href)) return;
          a.dataset.tbnaUrl = '1';
          try {
            const t = new URL(a.href).searchParams.get('url');
            if (t) a.href = decodeURIComponent(t);
          } catch (e) { /* 原样保留 */ }
        });
      }
    },
    {
      id: 'autoExpand', label: '自动展开楼中楼', def: false,
      sweep: function () {
        $all(AD.expandSel).forEach(function (el) {
          if (el.dataset.tbnaExp === '1') return;
          if (!/(展开|更多|条回复)/.test((el.textContent || '').trim())) return;
          el.dataset.tbnaExp = '1';
          el.click();
        });
      }
    },
    {
      id: 'onlyOp', label: '只看楼主（悬浮球「楼」）', def: false,
      sweep: function () {
        if (!S.onlyOp) return;
        if (!onlyOpAuthor) {
          const first = document.querySelector(AD.post);
          if (!first) return;
          onlyOpAuthor = authorOf(first);
          if (!onlyOpAuthor) return;
        }
        $all(AD.post).forEach(function (p) {
          if (p.classList.contains('tbna-op-self')) return;
          const au = authorOf(p);
          if (!au) return;
          p.classList.add(au === onlyOpAuthor ? 'tbna-op-self' : 'tbna-op-other');
        });
      }
    },
    { id: 'quickNav', label: '悬浮导航按钮', def: true, mount: mountDock },
    { id: 'floorNav', label: '楼层跳转下拉', def: true, mount: mountFloorNav, sweep: refreshFloorNav },
    { id: 'imgView', label: '图片浏览（滚轮切图 / Ctrl 缩放）', def: true },
    { id: 'sign', label: '一键签到（悬浮球「签」）', def: true, mount: mountSign },
    { id: 'signAuto', label: '打开页面时自动签到', def: false, sweep: autoSignOnce },
    { id: 'signOncePerDay', label: '自动签到时每天只签一次', def: true }
  ];

  /* =========================================================
   * 5. 旧版专有
   * ========================================================= */
  const OLD_ONLY = [
    {
      id: 'hideAds', label: '去广告 / 推广（旧版规则）', def: true,
      css: [
        '.spreadad,.game_frs_step1,.BAIDU_CLB_AD,.dasense,.u9_head,.j_click_stats',
        '.p_postlist>div:not(.l_post):not(.p_postlist)',
        '[id="pagelet_encourage-appforum/pagelet/my_app"]','.life_helper','[data-daid]',
        '#game_pop_window','#game_live_list','#j_ten_years','#sofa_post','.banner_post',
        '#pb_adbanner','.l_banner.banner_theme','.af_head_gamelink','.j_couplet',
        '#encourage_entry','.platform_aside_tieba_partner','.search_back_box',
        '.tb_poster_placeholder','.edui-btn-voice,.j_voice_ad_gif,.lzl_panel_voice',
        '.poster_head_surveillance','.doupiao_offline,.fMember_cnt',
        '.u_tshow,.u_tbmall,.u_app,.u_wallet,.u_xiu8,.u_joinvip,.u_baiduPrivilege,.u_appcenterEntrance',
        '#threadListGroupCnt'
      ].join(',') + '{display:none !important}'
    },
    { id: 'bubble', label: '屏蔽楼层气泡', def: false, css: '.post_bubble_top,.post_bubble_middle,.post_bubble_bottom{background:none !important;padding:0 !important}' },
    { id: 'iconHide', label: '隐藏用户印记', def: false, css: '.icon_wrap{display:none !important}' },
    { id: 'orange', label: '移除会员彩名', def: false, css: '.sign_highlight,.vip_red,.fiesta_member,.fiesta_member_red,.member_thread_title_frs{color:inherit !important;background:none !important}' },
    { id: 'saveFace', label: '隐藏挽尊卡背景', def: true, css: '.save_face_post{background:none !important}' },
    { id: 'rmBottom', label: '移除底部固定工具栏', def: false, css: '#j_core_title_wrap{position:static !important}' },
    { id: 'hideAvatar', label: '隐藏楼层头像', def: false, css: '.l_post .p_author_face{display:none !important}' },
    { id: 'hideVideo', label: '隐藏视频帖', def: false, css: '.j_thread_list:has(.threadlist_video){display:none !important}' },
    {
      id: 'quote', label: '引用楼层', def: true, sweep: sweepQuoteOld },
    { id: 'bigImgAuto', label: '贴子内直接显示大图（与查看器二选一）', def: false,
      sweep: function () {
        $all('.d_post_content img.BDE_Image').forEach(function (img) {
          if (img.dataset.tbnaBig === '1') return;
          const src = img.getAttribute('data-original') || img.src;
          if (!src) return;
          img.dataset.tbnaBig = '1';
          const big = bigSrc(src);
          if (big !== img.src) img.src = big;
        });
      }
    },
    { id: 'sortOld', label: '客户端排序（悬浮球 ⇅）', def: 'off', sweep: sortOldList }
  ];

  /* =========================================================
   * 6. 新版专有
   * ========================================================= */
  const NEW_ONLY = [
    { id: 'hideAds', label: '去推广 / 推荐卡', def: true, css: '[data-ad-hidden],.frs-right-sidebar [class*="ad-"]{display:none !important}' },
    { id: 'hideVideo', label: '隐藏视频帖', def: false, css: '.virtual-list-item:has(.video-wrapper),.virtual-list-item:has(video.art-video){display:none !important}' },
    { id: 'hideAvatar', label: '隐藏楼层头像', def: false, css: '.post-content [class*="avatar"],.pb-content-item [class*="avatar"]{display:none !important}' },
    { id: 'quote', label: '引用楼层', def: true, sweep: sweepQuoteNew },
    { id: 'plainName', label: '取消昵称高亮', def: false, css: '[class*="author"] [class*="name"]{background:none !important}' },
    { id: 'immerse', label: '沉浸模式（隐藏左右栏）', def: false, flag: true },
    { id: 'hideHead', label: '隐藏吧头图', def: false, flag: true },
    { id: 'capImages', label: '限制列表带图帖高度', def: true, flag: true },
    { id: 'openHere', label: '吧卡当前页打开（不开新标签）', def: true },
    { id: 'sortForum', label: '吧内默认「最新」', def: true, sweep: function () { tryNativeSort('forum'); } },
    { id: 'sortThread', label: '贴内默认「正序」', def: false, sweep: function () { tryNativeSort('thread'); } }
  ];

  /* =========================================================
   * 7. 设置
   * ========================================================= */
  const K = 'tbna.';
  const S = {};
  SHARED.concat(OLD_ONLY, NEW_ONLY).forEach(function (f) {
    if (S[f.id] === undefined) S[f.id] = GM_getValue(K + f.id, f.def);
  });
  S.keywords = GM_getValue(K + 'keywords', '');
  S.users = GM_getValue(K + 'users', '');
  S.widthPct = GM_getValue(K + 'widthPct', 100);
  const save = function (k, v) { S[k] = v; GM_setValue(K + k, v); };
  const forPage = function (p) { return SHARED.concat(p === 'old' ? OLD_ONLY : NEW_ONLY); };
  const enabled = (f) => !!S[f.id];

  let onlyOpAuthor = '';

  /* =========================================================
   * 8. 样式
   * ========================================================= */
  const BASE_CSS = [
    '.tbna-hidden{display:none !important}',
    '.tbna-op-other{display:none !important}',
    '.tbna-flash{outline:2px solid #3d7eff !important;outline-offset:2px}',
    '.tbna-dock{position:fixed;bottom:96px;z-index:999999;display:flex;flex-direction:column;gap:8px}',
    '.tbna-dock.left{left:14px}.tbna-dock.right{right:14px}',
    '.tbna-dock button,.tbna-dock select{width:38px;height:38px;border:0;border-radius:10px;cursor:pointer;background:rgba(24,26,32,.82);color:#fff;font-size:16px;line-height:1;box-shadow:0 2px 10px rgba(0,0,0,.28)}',
    '.tbna-dock select{font-size:12px;padding:0 2px}',
    '.tbna-dock button:hover{background:#3d7eff}',
    '.tbna-dock button.on{background:#3d7eff}',
    'body.tbna-nodock .tbna-dock{display:none}',
    '.tbna-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:999998;display:flex;align-items:center;justify-content:center}',
    '.tbna-panel{width:440px;max-height:80vh;overflow:auto;background:#fff;color:#222;border-radius:12px;padding:16px 18px;font:14px/1.6 system-ui,sans-serif}',
    '.tbna-panel h3{margin:0 0 4px;font-size:16px}',
    '.tbna-panel .tip{margin:0 0 12px;color:#888;font-size:12px}',
    '.tbna-sec{margin:10px 0 4px;color:#888;font-size:12px;font-weight:700}',
    '.tbna-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0}',
    '.tbna-panel textarea{width:100%;box-sizing:border-box;height:58px;margin:6px 0 10px;padding:6px;border:1px solid #ddd;border-radius:8px;font:12px/1.5 monospace}',
    '.tbna-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}',
    '.tbna-actions button{padding:7px 16px;border:0;border-radius:8px;cursor:pointer;background:#3d7eff;color:#fff}',
    '.tbna-actions button.ghost{background:#eee;color:#333}',
    '.tbna-viewer{position:fixed;inset:0;z-index:999997;background:rgba(0,0,0,.93);overflow:hidden;cursor:default}',
    '.tbna-viewer>img{position:absolute;left:50%;top:50%;margin:-0 0 0 0;transform-origin:center;max-width:none;max-height:none;cursor:grab;user-select:none;translate:-50% -50%}',
    '.tbna-bar{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(30,32,38,.9)}',
    '.tbna-bar .tbna-cnt{color:#ddd;font:13px monospace;margin-right:8px}',
    '.tbna-bar button{width:30px;height:30px;border:0;border-radius:8px;cursor:pointer;background:rgba(255,255,255,.14);color:#fff;font-size:14px}',
    '.tbna-bar button:hover{background:#3d7eff}',
    ':root{--tbna-cw:100%}',
    'body.tbna-immerse .left-content,body.tbna-immerse .left-nav-wrapper,body.tbna-immerse .drawer-body,body.tbna-immerse .frs-page-container>div:first-child{width:0 !important;min-width:0 !important;flex-basis:0 !important;margin:0 !important;padding:0 !important;border:none !important;overflow:hidden !important}',
    'body.tbna-immerse .left-nav-wrapper .main,body.tbna-immerse .left-nav-wrapper .list-container-wrapper,body.tbna-immerse .tb-home,body.tbna-immerse .home-icon,body.tbna-immerse .home-icon-min{display:none !important}',
    'body.tbna-immerse .frs-right-sidebar{display:none !important}',
    'body.tbna-immerse .frs-container,body.tbna-immerse .frs-page-container,body.tbna-immerse .content-wrapper{width:var(--tbna-cw) !important;max-width:none !important;display:flex !important;margin:0 auto !important;justify-content:center !important}',
    'body.tbna-hideHead .head-pic-area,body.tbna-hideHead .forum-head-container,body.tbna-hideHead .card-header img[src*="forum-header"]{display:none !important}',
    'body.tbna-capImages .thread-image .lazy-img-wrapper,body.tbna-capImages .thread-image img{max-height:35vh !important;width:auto !important;max-width:100% !important;object-fit:contain !important}',
    'body.tbna-capImages .thread-card-wrapper .media-grid{max-height:40vh !important;overflow:hidden !important}',
    '.tbna-fold-btn{font-weight:700}',
    'body.tbna-fold .tbna-dock button:not(.tbna-fold-btn),body.tbna-fold .tbna-dock select,body.tbna-fold .tbna-dock input{display:none}',
    '.tbna-cw{width:38px;height:38px;background:rgba(24,26,32,.82);border-radius:10px;writing-mode:vertical-lr;direction:rtl;accent-color:#3d7eff;cursor:pointer}',
    '.tbna-cwd{position:fixed;bottom:96px;z-index:999999;color:#fff;background:rgba(24,26,32,.82);border-radius:8px;padding:2px 6px;font:11px monospace}',
    '.tbna-quote{color:#3d7eff;cursor:pointer}',
    '.tbna-quote:hover{text-decoration:underline}',
    '.tbna-qbtn{margin-left:8px;padding:1px 8px;border:1px solid #d6d6d6;border-radius:9px;background:transparent;color:#888;font-size:12px;cursor:pointer;line-height:18px}',
    '.tbna-qbtn:hover{color:#3d7eff;border-color:#3d7eff}',
    '.tbna-toast{position:fixed;top:16px;right:16px;z-index:999996;max-width:320px;padding:10px 14px;border-radius:10px;background:rgba(30,32,38,.94);color:#fff;font:13px/1.5 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.3)}'
  ].join('\n');

  function injectCss() {
    const extra = FEATURES.filter(function (f) { return f.css; })
      .map(function (f) { return 'body.tbna-' + f.id + ' ' + f.css; })
      .join('\n');
    const el = document.createElement('style');
    el.textContent = BASE_CSS + '\n' + extra;
    document.head.appendChild(el);
  }

  function applyBodyFlags() {
    if (!document.body) return;
    FEATURES.forEach(function (f) {
      if (!f.css && !f.flag) return;
      document.body.classList.toggle('tbna-' + f.id, !!S[f.id]);
    });
    if (cwBox) cwBox.style.display = S.immerse ? '' : 'none';
    document.body.classList.toggle('tbna-nodock', !S.quickNav);
  }

  /* =========================================================
   * 9. 排序
   * ========================================================= */
  let sortTries = 0;
  function tryNativeSort(which) {
    if (sortTries > 40 || PAGE !== 'new') return;
    sortTries++;
    if (which === 'forum' && S.sortForum) {
      const tabs = $all(AD.tabForum);
      const want = tabs.filter(function (t) { return (t.textContent || '').trim() === AD.forumText; })[0];
      const act = tabs.filter(function (t) { return /active/.test(t.className); })[0];
      if (want && act !== want) { want.click(); sortTries = 99; return; }
    }
    if (which === 'thread' && S.sortThread) {
      const it = $all(AD.tabThread).filter(function (t) { return (t.textContent || '').trim() === AD.threadText; })[0];
      const act = document.querySelector(AD.activeThread);
      if (it && act !== it) { it.click(); sortTries = 99; }
    }
  }

  function sortOldList() {
    if (PAGE !== 'old') return;
    const mode = S.sortOld;
    if (!mode || mode === 'off') return;
    const box = document.querySelector('#thread_list');
    if (!box) return;
    const nodes = $all('.j_thread_list', box);
    if (!nodes.length) return;
    const meta = nodes.map(function (n) {
      let id = 0, rep = 0;
      const df = n.getAttribute('data-field');
      if (df) {
        try {
          const j = JSON.parse(df.replace(/'/g, '"'));
          id = +j.id || 0; rep = +j.reply_num || 0;
        } catch (e) { /* 忽略 */ }
      }
      return { n: n, id: id, rep: rep, top: /thread_top/.test(n.className) };
    });
    const tops = meta.filter(function (m) { return m.top; });
    const rest = meta.filter(function (m) { return !m.top; });
    if (mode === 'id_asc') rest.sort(function (a, b) { return a.id - b.id; });
    else if (mode === 'id_desc') rest.sort(function (a, b) { return b.id - a.id; });
    else if (mode === 'rep_desc') rest.sort(function (a, b) { return b.rep - a.rep; });
    const want = tops.concat(rest);
    for (let i = 0; i < want.length; i++) {
      if (box.children[i] !== want[i].n) {
        want.forEach(function (m) { box.appendChild(m.n); });
        return;
      }
    }
  }

  /* =========================================================
   * 10. 悬浮导航 / 楼层跳转
   * ========================================================= */
  function mkBtn(title, label, fn) {
    const b = document.createElement('button');
    b.title = title; b.textContent = label; b.onclick = fn;
    return b;
  }

  function mountDock() {
    if (document.querySelector('.tbna-dock')) return;
    const dock = document.createElement('div');
    dock.className = 'tbna-dock ' + (AD.dockSide || 'right');
    const foldBtn = mkBtn('收起 / 展开按钮', '≡', function () {
      document.body.classList.toggle('tbna-fold');
    });
    foldBtn.classList.add('tbna-fold-btn');
    dock.appendChild(foldBtn);
    dock.appendChild(mkBtn('回到顶部', '↑', function () { scrollToY(0); }));
    dock.appendChild(mkBtn('回到底部', '↓', function () { scrollToY(scroller().scrollHeight); }));
    dock.appendChild(mkBtn('刷新', '↻', function () { location.reload(); }));

    const opBtn = mkBtn('只看楼主', '楼', function () {
      save('onlyOp', !S.onlyOp);
      opBtn.classList.toggle('on', !!S.onlyOp);
      if (!S.onlyOp) $all('.tbna-op-other').forEach(function (p) { p.classList.remove('tbna-op-other'); });
      else onlyOpAuthor = '';
      schedule();
    });
    opBtn.classList.toggle('on', !!S.onlyOp);
    dock.appendChild(opBtn);

    if (PAGE === 'old') {
      const modes = ['off', 'id_asc', 'id_desc', 'rep_desc'];
      const sb = mkBtn('排序：' + S.sortOld, '⇅', function () {
        const next = modes[(modes.indexOf(S.sortOld) + 1) % modes.length];
        save('sortOld', next);
        sb.title = '排序：' + next;
        sb.classList.toggle('on', next !== 'off');
        sortOldList();
      });
      sb.classList.toggle('on', S.sortOld !== 'off');
      dock.appendChild(sb);
    }
    dock.appendChild(mkBtn('设置', '⚙', openPanel));
    document.body.appendChild(dock);
  }

  function bindNav() {
    document.addEventListener('click', function (e) {
      if (!S.openHere || PAGE !== 'new') return;
      const card = e.target.closest && e.target.closest('.forum-card-wrapper');
      if (!card || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
      const name = (card.querySelector('.forum-name') || {}).textContent;
      if (!name || !name.trim()) return;
      e.preventDefault();
      e.stopPropagation();
      history.pushState(null, '', 'https://tieba.baidu.com/f?kw=' + encodeURIComponent(name.trim()));
      dispatchEvent(new PopStateEvent('popstate'));
    }, true);
  }

  let cwBox = null;
  function mountWidth() {
    const dock = document.querySelector('.tbna-dock');
    if (!dock) { setTimeout(mountWidth, 150); return; }
    if (dock.querySelector('.tbna-cw')) return;
    const wrap = document.createElement('div');
    wrap.className = 'tbna-cwbox';
    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'tbna-cw';
    input.min = '50';
    input.max = '100';
    input.value = String(S.widthPct || 100);
    input.title = '版心宽度';
    input.oninput = function () {
      document.documentElement.style.setProperty('--tbna-cw', input.value + '%');
      input.title = '版心宽度 ' + input.value + '%';
    };
    input.onchange = function () { save('widthPct', +input.value); };
    wrap.appendChild(input);
    const before = dock.querySelector('button[title="设置"]');
    if (before) dock.insertBefore(wrap, before); else dock.appendChild(wrap);
    cwBox = wrap;
    document.documentElement.style.setProperty('--tbna-cw', (S.widthPct || 100) + '%');
    wrap.style.display = S.immerse ? '' : 'none';
  }

  let floorSel = null, floorBuilt = -1;
  function mountFloorNav() {
    if (floorSel || !document.querySelector('.tbna-dock')) return;
    floorSel = document.createElement('select');
    floorSel.title = '跳到楼层';
    floorSel.onchange = function () {
      const idx = +floorSel.value;
      if (!idx) return;
      const p = $all(AD.post)[idx - 1];
      if (p) {
        p.scrollIntoView({ behavior: 'smooth', block: 'start' });
        p.classList.add('tbna-flash');
        setTimeout(function () { p.classList.remove('tbna-flash'); }, 1600);
      }
      floorSel.selectedIndex = 0;
    };
    const dock = document.querySelector('.tbna-dock');
    const before = dock.querySelector('button[title="设置"]');
    if (before) dock.insertBefore(floorSel, before); else dock.appendChild(floorSel);
  }
  function refreshFloorNav() {
    if (!floorSel) return;
    if (!/\/p\//.test(location.pathname)) { floorSel.style.display = 'none'; return; }
    floorSel.style.display = '';
    const n = $all(AD.post).length;
    if (n === floorBuilt) return;
    floorBuilt = n;
    let html = '<option value="0">' + Math.max(n, 1) + '楼</option>';
    for (let i = 1; i <= n; i++) html += '<option value="' + i + '">' + i + '楼</option>';
    floorSel.innerHTML = html;
  }

  /* =========================================================
   * 11. 图片事件
   * ========================================================= */
  let bound = false;
  function bindImgEvents() {
    if (bound) return;
    bound = true;

    document.addEventListener('wheel', function (e) {
      if (V.el) {
        e.preventDefault();
        if (S.imgView && (e.ctrlKey || e.metaKey)) vZoom(e.deltaY > 0 ? 0.9 : 1.1);
        else vShow(V.idx + (e.deltaY > 0 ? 1 : -1));
        return;
      }
      if (PAGE !== 'new' || !AD.viewer || !e.target.closest) return;
      const v = e.target.closest(AD.viewer);
      if (!v) return;
      e.preventDefault();
      const btn = v.querySelector(e.deltaY > 0 ? AD.viewerNext : AD.viewerPrev);
      if (btn) btn.click();
    }, { passive: false, capture: true });

    addEventListener('keydown', function (e) {
      if (!V.el) return;
      if (e.key === 'Escape') vClose();
      else if (e.key === 'ArrowRight') vShow(V.idx + 1);
      else if (e.key === 'ArrowLeft') vShow(V.idx - 1);
      else if (e.key === '+' || e.key === '=') vZoom(1.2);
      else if (e.key === '-') vZoom(0.8);
      else if (e.key === 'r' || e.key === 'R') { V.rot = (V.rot + 90) % 360; vApply(); }
      else if (e.key === '0') vReset();
    });

    if (!AD.bigImg) return;
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      const img = e.target.closest(AD.bigImg);
      if (!img || V.el || !S.imgView) return;
      e.preventDefault();
      e.stopPropagation();
      const all = $all(AD.bigImg);
      const list = all.map(function (i) { return bigSrc(i.getAttribute('data-original') || i.src); });
      vOpen(list, all.indexOf(img));
    }, true);

    document.addEventListener('dblclick', function (e) {
      if (!e.target.closest) return;
      const img = e.target.closest(AD.bigImg);
      if (!img || V.el) return;
      e.preventDefault();
      const all = $all(AD.bigImg);
      const list = all.map(function (i) { return bigSrc(i.getAttribute('data-original') || i.src); });
      vOpen(list, all.indexOf(img));
    }, true);
  }

  /* =========================================================
   * 12. 调度
   * ========================================================= */
  let timer = null;
  function sweep() {
    applyBodyFlags();
    FEATURES.forEach(function (f) {
      if (!f.sweep || !enabled(f)) return;
      try { f.sweep(); } catch (e) { console.warn('[tbna]', f.id, e); }
    });
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; sweep(); }, 200);
  }

  let routeToken = 0;
  function onRoute() {
    const token = ++routeToken;
    sortTries = 0;
    onlyOpAuthor = '';
    floorBuilt = -1;
    [600, 1800].forEach(function (ms) {
      setTimeout(function () { if (token === routeToken) schedule(); }, ms);
    });
  }

  /* =========================================================
   * 13. 面板
   * ========================================================= */
  function openPanel() {
    const old = document.querySelector('.tbna-mask');
    if (old) old.remove();
    const mask = document.createElement('div');
    mask.className = 'tbna-mask';
    const panel = document.createElement('div');
    panel.className = 'tbna-panel';
    const rows = function (list) {
      return list.map(function (f) {
        const checked = f.id === 'sortOld' ? S[f.id] !== 'off' : !!S[f.id];
        return '<label class="tbna-row"><span>' + f.label + '</span><input type="checkbox" data-k="' + f.id + '"' + (checked ? ' checked' : '') + '></label>';
      }).join('');
    };
    const hint = has('a.jx') || has('#btzi_gallery')
      ? '<p class="tip">旧版「贴吧全能助手」仍在运行，建议停用它避免重复。</p>' : '';
    panel.innerHTML =
      '<h3>贴吧助手 · ' + (PAGE === 'old' ? '旧版页面' : '新版页面') + '</h3>' +
      '<p class="tip">两版功能各自生效，配置共用一份</p>' + hint +
      '<div class="tbna-sec">通用</div>' + rows(SHARED) +
      '<div class="tbna-sec">' + (PAGE === 'old' ? '旧版专有' : '新版专有') + '</div>' + rows(PAGE === 'old' ? OLD_ONLY : NEW_ONLY) +
      '<div class="tbna-sec">屏蔽词</div>' +
      '<div>标题（一行一个）<textarea class="tbna-kw"></textarea></div>' +
      '<div>用户名（一行一个）<textarea class="tbna-us"></textarea></div>' +
      '<div class="tbna-actions"><button class="ghost" data-act="close">关闭</button><button data-act="save">保存</button></div>';
    panel.querySelector('.tbna-kw').value = S.keywords;
    panel.querySelector('.tbna-us').value = S.users;
    mask.appendChild(panel);
    mask.addEventListener('click', function (e) { if (e.target === mask) mask.remove(); });
    panel.querySelector('[data-act="close"]').onclick = function () { mask.remove(); };
    panel.querySelector('[data-act="save"]').onclick = function () {
      $all('input[data-k]', panel).forEach(function (cb) {
        const k = cb.getAttribute('data-k');
        if (k === 'sortOld') save(k, cb.checked ? (S.sortOld === 'off' ? 'id_asc' : S.sortOld) : 'off');
        else save(k, cb.checked);
      });
      save('keywords', panel.querySelector('.tbna-kw').value);
      save('users', panel.querySelector('.tbna-us').value);
      $all('[data-tbna-shot]').forEach(function (el) {
        delete el.dataset.tbnaShot;
        el.classList.remove('tbna-hidden', 'tbna-op-other', 'tbna-op-self');
      });
      onlyOpAuthor = '';
      mask.remove();
      applyBodyFlags();
      schedule();
    };
    document.body.appendChild(mask);
  }

  /* =========================================================
   * 14. 启动
   * ========================================================= */
  function start(page) {
    PAGE = page;
    AD = A[page];
    FEATURES = forPage(page);
    injectCss();
    applyBodyFlags();
    bindImgEvents();
    bindQuote();
    bindNav();
    mountWidth();
    FEATURES.forEach(function (f) { if (f.mount) { try { f.mount(); } catch (e) { } } });
    sweep();
    sortTries = 0;

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

    const _push = history.pushState, _replace = history.replaceState;
    history.pushState = function () { _push.apply(this, arguments); onRoute(); };
    history.replaceState = function () { _replace.apply(this, arguments); onRoute(); };
    addEventListener('popstate', onRoute);

    try { GM_registerMenuCommand('贴吧助手设置（' + (page === 'old' ? '旧版' : '新版') + '）', openPanel); } catch (e) { }
  }

  function boot() {
    const p = detect();
    if (p) { start(p); return; }
    let n = 0;
    const t = setInterval(function () {
      const q = detect();
      if (q) { clearInterval(t); start(q); return; }
      if (++n > 30) clearInterval(t);
    }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
