// 掘金沸点左侧导航菜单 — content script
// 设计文档：docs/superpowers/specs/2026-09-20-juejin-pins-layout-design.md

(() => {
  'use strict';

  const SELECTORS = {
    fixbox: '.featured-sidebar.left-sidebar > .fixbox',
  };

  const ORIGIN = 'https://juejin.cn';

  const MENU_ITEMS = [
    { label: '推荐',       path: '/pins/hot' },
    { label: '最新',       path: '/pins/new' },
    { label: '上班摸鱼',   path: '/pins/myclub/6824710203301167112' },
    { label: '理财交流圈', path: '/pins/myclub/6931179346187321351' },
    { label: '读书会',     path: '/pins/myclub/6824710202248396813' },
    { label: '树洞一下',   path: '/pins/myclub/6824710203112423437' },
  ];

  const WAIT_TIMEOUT = 10000;
  const POLL_INTERVAL = 200;

  /**
   * 轮询等待选择器命中。
   * Vue 异步渲染，run_at: document_idle 时 DOM 未必就绪，必须等。
   * @returns {Promise<Element|null>} 命中返回元素，超时返回 null
   */
  function waitFor(selector, timeout = WAIT_TIMEOUT) {
    return new Promise(resolve => {
      const hit = document.querySelector(selector);
      if (hit) return resolve(hit);

      const started = Date.now();
      const timer = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(timer);
          resolve(el);
        } else if (Date.now() - started >= timeout) {
          clearInterval(timer);
          resolve(null);
        }
      }, POLL_INTERVAL);
    });
  }

  /**
   * 生成菜单 DOM。
   * 不挂任何掘金的 class，避免被其 scoped 规则命中。
   */
  function buildMenu() {
    const menu = document.createElement('div');
    menu.className = 'jjp-menu';

    for (const item of MENU_ITEMS) {
      const a = document.createElement('a');
      a.className = 'jjp-menu__item';
      a.textContent = item.label;
      a.href = ORIGIN + item.path;
      a.dataset.path = item.path;
      a.addEventListener('click', onItemClick);
      menu.appendChild(a);
    }

    return menu;
  }

  /**
   * 幂等插入：保证菜单始终是 fixbox 的第一个子元素，
   * 即位于「如何玩转沸点」（a.guide-link.top）正上方。
   * @returns {Element} 菜单元素
   */
  function ensureMenu(fixbox) {
    let menu = fixbox.querySelector(':scope > .jjp-menu');
    if (menu && fixbox.firstElementChild === menu) return menu;

    if (!menu) menu = buildMenu();
    fixbox.insertBefore(menu, fixbox.firstElementChild);
    return menu;
  }

  /**
   * SPA 软跳转。
   * pushState 只改地址栏，不触发路由；补派发 popstate 让 Vue Router 3
   * 的 popstate 监听读到新 location 并执行跳转。
   * 抛错时兜底整页跳转，保证「点了永远有反应」。
   */
  function navigate(url) {
    try {
      history.pushState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err) {
      location.href = url;
    }
  }

  /**
   * 只在普通左键单击时接管。
   * 带修饰键或非左键一律放行，保留中键 / Ctrl+点击开新标签页的原生行为。
   */
  function onItemClick(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(e.currentTarget.href);
  }

  /**
   * 按 location.pathname 精确匹配刷新高亮。
   * 遍历子元素而非查询 MENU_ITEMS，菜单被重建后依然正确。
   */
  function refreshActive() {
    const menu = document.querySelector('.jjp-menu');
    if (!menu) return;

    const current = location.pathname;
    for (const a of menu.children) {
      a.classList.toggle('is-active', a.dataset.path === current);
    }
  }

  /**
   * 保活。
   * 观察根选 .main-container 而不是 document.body：该节点稳定存在、
   * 范围收敛，从 body 观察会把悬浮面板、弹层等无关变动全收进来。
   * 它必然存在 —— init() 已等到 .fixbox 命中，而 .fixbox 就在其内部。
   */
  function watch() {
    const root = document.querySelector('.main-container');
    if (!root) return;

    const observer = new MutationObserver(() => {
      const fixbox = document.querySelector(SELECTORS.fixbox);
      if (fixbox) ensureMenu(fixbox);
      refreshActive();
    });

    observer.observe(root, { childList: true, subtree: true });
  }

  async function init() {
    const fixbox = await waitFor(SELECTORS.fixbox);
    if (!fixbox) {
      console.warn('[jjp] 未找到', SELECTORS.fixbox, '，插件未生效');
      return;
    }

    ensureMenu(fixbox);
    refreshActive();
    window.addEventListener('popstate', refreshActive);
    watch();
  }

  init();
})();
