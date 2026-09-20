# 掘金沸点左侧导航菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在掘金沸点页左侧栏注入一个 6 项的自定义纵向菜单，点击执行 SPA 软跳转并高亮当前路由，同时隐藏中栏重复的导航区。

**Architecture:** 零构建 MV3 content script。`content.js` 用轮询等到左栏常驻区块 `.fixbox` 出现后，把自建菜单插为其第一个子元素（位于「如何玩转沸点」正上方），从而继承 `.fixbox` 的常驻定位；用 `MutationObserver` 在 Vue 重建该区块时补回菜单并顺带刷新选中态。`content.css` 承担菜单外观与 `.feed-controls` 的隐藏。

**Tech Stack:** Chrome Extension Manifest V3、原生 JavaScript（无构建、无依赖）、原生 CSS。

---

## 关于测试与提交

本计划**不含自动化测试，也不含 git 提交**，这是设计阶段明确做出的决定，不是遗漏：

- **无自动化测试**：全部逻辑约 90 行 DOM 操作与事件处理，正确性取决于掘金线上的真实 DOM。jsdom 只能验证我们自己构造的假 DOM，验证不到真实风险点，收益不抵维护成本。每个任务用「在真实页面上执行的 DevTools 断言」代替测试。
- **无 git 提交**：项目当前不是 git 仓库，用户明确表示不需要。每个任务以「重新加载扩展 + 执行断言」作为检查点，代替提交。

设计文档：`docs/superpowers/specs/2026-09-20-juejin-pins-layout-design.md`

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `manifest.json` | MV3 清单。声明匹配范围 `https://juejin.cn/pins/*`，注入 `content.css` 与 `content.js`。无任何权限声明。 |
| `src/content.css` | 菜单外观 + 隐藏 `.feed-controls`。纯声明式，不依赖 JS 执行顺序。 |
| `src/content.js` | 全部行为逻辑。单文件，按职责分成若干函数：等待元素、构建菜单、幂等插入、刷新选中态、软跳转、保活观察器。 |

三个文件各自独立、职责单一。`content.css` 单独就能完成「隐藏 feed-controls」这一半需求，`content.js` 单独就能完成「注入菜单」这一半 —— 两者没有初始化顺序依赖。

---

## Task 1: 项目骨架与样式

建立可加载的扩展骨架。完成后：扩展能装进 Chrome、`.feed-controls` 被隐藏、控制台的探针能打印出目标区块。此时还没有菜单。

**Files:**
- Create: `manifest.json`
- Create: `src/content.css`
- Create: `src/content.js`

- [ ] **Step 1: 创建 `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "掘金沸点左侧导航",
  "version": "0.1.0",
  "description": "在沸点页左侧栏注入常用入口菜单，隐藏中栏的重复导航",
  "content_scripts": [
    {
      "matches": ["https://juejin.cn/pins/*"],
      "css": ["src/content.css"],
      "js": ["src/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

不声明 `permissions`、`host_permissions`、`icons`。`matches` 已足够覆盖需求，声明多余权限会在安装时弹出无谓的提示。

- [ ] **Step 2: 创建 `src/content.css`**

```css
/* 掘金沸点左侧导航菜单
   设计文档：docs/superpowers/specs/2026-09-20-juejin-pins-layout-design.md */

/* ── 自定义菜单 ─────────────────────────────────────────────
   class 以 jjp- 前缀隔离命名空间，不会命中掘金的 scoped 规则，
   因此无需 !important。 */

.jjp-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}

.jjp-menu__item {
  display: block;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 22px;
  color: #4e5969;
  text-decoration: none;
  transition: background-color .2s, color .2s;
}

.jjp-menu__item:hover {
  background-color: #f4f5f5;
  color: #1e80ff;
}

.jjp-menu__item.is-active {
  background-color: #e8f3ff;
  color: #1e80ff;
  font-weight: 500;
}

/* ── 隐藏中栏重复导航 ───────────────────────────────────────
   用 CSS 而非 JS：Vue 重建该节点时样式自动重新命中，不需要监听，
   也不会出现「隐藏状态丢失」。

   这里必须用 !important：要整块移除的是一个完整组件，display 由
   掘金自己的 scoped 规则控制，不强制覆盖压不住。这是全文件唯一
   使用 !important 的地方。 */

.main-container .feed-controls {
  display: none !important;
}
```

- [ ] **Step 3: 创建 `src/content.js`（探针版）**

```js
// 掘金沸点左侧导航菜单 — content script
// 设计文档：docs/superpowers/specs/2026-09-20-juejin-pins-layout-design.md

(() => {
  'use strict';

  const SELECTORS = {
    fixbox: '.featured-sidebar.left-sidebar > .fixbox',
  };

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

  async function init() {
    const fixbox = await waitFor(SELECTORS.fixbox);
    if (!fixbox) {
      console.warn('[jjp] 未找到', SELECTORS.fixbox, '，插件未生效');
      return;
    }
    console.log('[jjp] 探针命中 fixbox：', fixbox);
  }

  init();
})();
```

- [ ] **Step 4: 在 Chrome 中加载扩展**

打开 `chrome://extensions`，右上角开启「开发者模式」，点「加载已解压的扩展程序」，选择 `d:/02_projects/opensource/juefei` 目录。

Expected：扩展卡片出现，标题为「掘金沸点左侧导航」，版本 `0.1.0`，**不显示任何权限警告**。若报「无法加载 manifest」则检查 JSON 语法。

- [ ] **Step 5: 验证探针与 CSS 隐藏生效**

打开 `https://juejin.cn/pins/hot`，按 F12 打开 Console。Expected：看到一行 `[jjp] 探针命中 fixbox：` 后跟一个 `div.fixbox` 元素，且无红色报错。

切到 Console 的上级「Elements」面板或直接在 Console 执行：

```js
getComputedStyle(document.querySelector('.feed-controls')).display
```

Expected：返回 `"none"`。

```js
document.querySelectorAll('.jjp-menu').length
```

Expected：返回 `0`（此时还没有菜单，符合预期）。

- [ ] **Step 6: 检查点**

确认 Step 4、5 全部符合 Expected。若探针提示「未找到」，说明 `.fixbox` 选择器失效，需回到 `body.html` 重新核对 —— 在 Console 执行 `document.querySelectorAll('.fixbox').length` 应为 `2`（左栏一个、右栏一个）。

---

## Task 2: 菜单构建与注入

菜单出现在左栏「如何玩转沸点」正上方。

**Files:**
- Modify: `src/content.js`

- [ ] **Step 1: 在 `SELECTORS` 下方加入常量与菜单数据**

在 `const SELECTORS = { ... };` 之后、`const WAIT_TIMEOUT` 之前插入：

```js
  const ORIGIN = 'https://juejin.cn';

  const MENU_ITEMS = [
    { label: '推荐',       path: '/pins/hot' },
    { label: '最新',       path: '/pins/new' },
    { label: '上班摸鱼',   path: '/pins/myclub/6824710203301167112' },
    { label: '理财交流圈', path: '/pins/myclub/6931179346187321351' },
    { label: '读书会',     path: '/pins/myclub/6824710202248396813' },
    { label: '树洞一下',   path: '/pins/myclub/6824710203112423437' },
  ];
```

数组顺序即渲染顺序。`href` 由 `ORIGIN + path` 拼出，不重复维护。

- [ ] **Step 2: 在 `waitFor` 之后加入 `buildMenu` 与 `ensureMenu`**

```js
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
```

前置判断 `menu && fixbox.firstElementChild === menu` 承担两个职责：跳过冗余插入，以及防止后续 `watch()` 的自激循环。

`menu &&` 这个前置条件是必需的，不能省。`waitFor()` 只等到 `.fixbox` 存在，没等它内部渲染完；若此刻 `.fixbox` 恰好是空的，`menu` 和 `firstElementChild` 同为 `null`，省略后会满足相等判断而直接返回，菜单永远插不进去。

`insertBefore(menu, null)` 的语义是追加到末尾，所以 `.fixbox` 为空时行为同样正确。

- [ ] **Step 3: 改写 `init()`**

把 `init()` 整个替换为：

```js
  async function init() {
    const fixbox = await waitFor(SELECTORS.fixbox);
    if (!fixbox) {
      console.warn('[jjp] 未找到', SELECTORS.fixbox, '，插件未生效');
      return;
    }
    ensureMenu(fixbox);
  }
```

- [ ] **Step 4: 重新加载扩展并刷新页面**

在 `chrome://extensions` 点该扩展卡片的刷新图标，然后回到沸点页按 `Ctrl+R`。

Expected：左栏「如何玩转沸点」上方出现 6 项纵向菜单 —— 推荐 / 最新 / 上班摸鱼 / 理财交流圈 / 读书会 / 树洞一下。此时已有样式，但点击无反应、无高亮。

- [ ] **Step 5: 验证 DOM 结构**

在 Console 执行：

```js
const menu = document.querySelector('.jjp-menu');
[menu.parentElement.className, menu.firstElementChild.textContent, menu.children.length]
```

Expected：返回 `["fixbox", "推荐", 6]` —— 父元素是 `fixbox`（不是 `left-sidebar`），首项是「推荐」，共 6 项。

```js
document.querySelector('.fixbox').firstElementChild.className !== document.querySelectorAll('.fixbox')[1].firstElementChild.className
```

Expected：返回 `true`，确认菜单只进了左栏那个 `.fixbox`，右栏未被污染。

- [ ] **Step 6: 检查点**

确认 Step 4、5 全部符合 Expected。若菜单出现在右栏，说明 `SELECTORS.fixbox` 的祖先限定失效，检查选择器是否被改动。

---

## Task 3: SPA 软跳转

点击菜单项切换路由，页面不整页刷新。

**Files:**
- Modify: `src/content.js`

- [ ] **Step 1: 在 `ensureMenu` 之后加入 `navigate` 与 `onItemClick`**

```js
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
```

- [ ] **Step 2: 给 `buildMenu` 里的链接绑定点击处理**

在 `a.dataset.path = item.path;` 这一行后面加一行：

```js
      a.addEventListener('click', onItemClick);
```

`buildMenu` 中该循环体最终为：

```js
    for (const item of MENU_ITEMS) {
      const a = document.createElement('a');
      a.className = 'jjp-menu__item';
      a.textContent = item.label;
      a.href = ORIGIN + item.path;
      a.dataset.path = item.path;
      a.addEventListener('click', onItemClick);
      menu.appendChild(a);
    }
```

- [ ] **Step 3: 重新加载扩展并刷新页面**

在 `chrome://extensions` 刷新扩展，回沸点页 `Ctrl+R`。

- [ ] **Step 4: 验证软跳转不刷新页面**

打开 DevTools 的 Network 面板，勾选 `Doc` 过滤（只看文档请求），点菜单里的「最新」。

Expected：地址栏变为 `https://juejin.cn/pins/new`，Network 面板**没有新增文档请求**，页面内容切换到最新沸点。

再点「推荐」。

Expected：地址栏回到 `https://juejin.cn/pins/hot`，同样无文档请求。

- [ ] **Step 5: 验证修饰键放行**

按住 `Ctrl` 点击「最新」。Expected：在后台新标签页打开 `https://juejin.cn/pins/new`，当前页面不动。

再在菜单项上点鼠标中键。Expected：同样在后台新标签页打开，当前页面不动。

- [ ] **Step 6: 检查点**

确认 Step 4、5 全部符合 Expected。

若 Step 4 表现为「点了没反应」（地址栏变了但内容没变，或地址栏都没变），说明 `pushState + popstate` 软跳转对本页失效。此时把 `onItemClick` 里的 `navigate(e.currentTarget.href);` 换成 `location.href = e.currentTarget.href;` 即可退回整页跳转 —— 这是设计文档第 12 节列出的已知风险，不要在这里反复尝试其他软跳转花招。

---

## Task 4: 选中态

当前路由对应的菜单项高亮。

**Files:**
- Modify: `src/content.js`

- [ ] **Step 1: 在 `onItemClick` 之后加入 `refreshActive`**

```js
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
```

只改 `classList`（属性变更），不改子节点，因此不会触发 `watch()` 里只订阅 `childList` 的观察器，不形成回路。

- [ ] **Step 2: 在 `init()` 中接入**

`init()` 替换为：

```js
  async function init() {
    const fixbox = await waitFor(SELECTORS.fixbox);
    if (!fixbox) {
      console.warn('[jjp] 未找到', SELECTORS.fixbox, '，插件未生效');
      return;
    }

    ensureMenu(fixbox);
    refreshActive();
    window.addEventListener('popstate', refreshActive);
  }
```

`navigate()` 内部派发的 `popstate` 会命中这个监听器，因此点击菜单后高亮自动更新，无需在 `onItemClick` 里重复调用 `refreshActive()`。

- [ ] **Step 3: 重新加载扩展并刷新页面**

- [ ] **Step 4: 验证初始高亮**

打开 `https://juejin.cn/pins/hot`，在 Console 执行：

```js
document.querySelector('.jjp-menu__item.is-active').textContent
```

Expected：返回 `"推荐"`。

- [ ] **Step 5: 验证点击后的高亮跟随**

点击「读书会」。Expected：地址栏变为 `https://juejin.cn/pins/myclub/6824710202248396813`，「读书会」获得蓝色高亮，其余 5 项恢复普通样式。

- [ ] **Step 6: 验证浏览器前进后退**

按浏览器后退键。Expected：回到上一个路由，高亮项同步回退，且**同时只有一个** `.is-active`。

```js
document.querySelectorAll('.jjp-menu__item.is-active').length
```

Expected：返回 `1`。

- [ ] **Step 7: 检查点**

确认 Step 4、5、6 全部符合 Expected。

---

## Task 5: 保活观察器

Vue 重建 `.fixbox` 后菜单自动补回。

**Files:**
- Modify: `src/content.js`

- [ ] **Step 1: 在 `refreshActive` 之后加入 `watch`**

```js
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
```

回调做两件事：把被 Vue 重建带走的菜单补回来；顺带刷新选中态 —— 掘金内部跳转走 Vue Router 自己的 `pushState`，**不会派发 `popstate`**，靠这里覆盖「用户点了页面里圈子链接」这类情况。

不形成循环：`ensureMenu()` 插入完成后前置判断为真，`refreshActive()` 只改属性，回调空转。

- [ ] **Step 2: 在 `init()` 中接入**

在 `init()` 的 `window.addEventListener('popstate', refreshActive);` 之后加一行：

```js
    watch();
```

- [ ] **Step 3: 重新加载扩展并刷新页面**

- [ ] **Step 4: 验证菜单能自我修复**

在 Console 手动删除菜单，模拟 Vue 重建把它带走：

```js
document.querySelector('.jjp-menu').remove();
document.querySelectorAll('.jjp-menu').length
```

Expected：第二条立即返回 `0`，随后（下一次 DOM 变动时）自动恢复为 `1`。若页面恰好很安静没有 DOM 变动，点一下菜单里的「最新」触发路由切换即可。

```js
document.querySelectorAll('.jjp-menu').length
document.querySelector('.fixbox').firstElementChild.className
```

Expected：返回 `1` 和 `"jjp-menu"` —— 菜单回到了 `.fixbox` 首位，即「如何玩转沸点」上方。

- [ ] **Step 5: 验证掘金自身跳转也能刷新高亮**

在页面中栏的沸点列表里随便点一个圈子标签跳转，或直接执行：

```js
history.pushState(null, '', '/pins/new');
document.querySelector('.main-container').appendChild(document.createElement('i'));
```

Expected：等待一次 DOM 变动后，「最新」获得高亮。这验证了 Step 1 中「不经 popstate 的路由切换也能刷新高亮」这一设计。

- [ ] **Step 6: 检查点**

确认 Step 4、5 全部符合 Expected。

---

## Task 6: 端到端验收

对照设计文档第 11 节的 12 条清单逐条走一遍。全部通过才算完成。

**Files:** 无改动（纯验收）

- [ ] **Step 1: 准备干净环境**

在 `chrome://extensions` 刷新扩展，回到 `https://juejin.cn/pins/hot` 按 `Ctrl+Shift+R` 硬刷新。清空 Console。

- [ ] **Step 2: 逐条核对**

| # | 检查项 | 断言 / 操作 | 期望 |
| --- | --- | --- | --- |
| 1 | 扩展已加载 | 看 `chrome://extensions` 卡片 | 已启用，无权限警告 |
| 2 | 页面可访问 | 打开 `/pins/hot` | 正常渲染 |
| 3 | 菜单位置与内容 | `[...document.querySelectorAll('.jjp-menu__item')].map(a => a.textContent)` | `["推荐","最新","上班摸鱼","理财交流圈","读书会","树洞一下"]` |
| 4 | 默认高亮 | `document.querySelector('.jjp-menu__item.is-active').textContent` | `"推荐"` |
| 5 | 逐项可跳转且不刷新 | 开 Network 勾选 `Doc`，依次点 6 项 | 地址栏正确变化，无新增文档请求 |
| 6 | 高亮跟随 | 每次点击后查 `.is-active` | 与当前路由一致 |
| 7 | 前进后退 | 浏览器前进 / 后退 | 高亮正确，`.is-active` 数量恒为 1 |
| 8 | 中键开新标签 | 中键点「最新」 | 后台新标签打开，当前页不动 |
| 9 | feed-controls 已隐藏 | `getComputedStyle(document.querySelector('.feed-controls')).display` | `"none"` |
| 10 | 滚动时菜单不脱离左栏 | 向下滚到底再滚回 | 菜单始终在「如何玩转沸点」正上方 |
| 11 | 硬刷新后一切照旧 | `Ctrl+Shift+R` 后重查第 3、4、9 项 | 结果一致，`.jjp-menu` 数量为 1 |
| 12 | Console 无报错 | 查看 Console | 无红色错误 |

- [ ] **Step 3: 验证生效范围收窄**

打开 `https://juejin.cn/post/7687069228299616307`（任意一篇掘金文章）。Expected：`document.querySelectorAll('.jjp-menu').length` 返回 `0`，文章页完全不受影响。

- [ ] **Step 4: 记录遗留问题**

若第 5 项失败（软跳转无效），按 Task 3 Step 6 的说明退回整页跳转，并在设计文档第 12 节把该风险标记为「已确认发生」。

若第 9、10 项外观不符合预期，给 `.jjp-menu` 相关规则做针对性微调，**不要**扩大 `!important` 的使用范围。

---

## 自审记录

对照设计文档逐节核对的结果：

| 设计文档章节 | 覆盖任务 |
| --- | --- |
| 6. manifest.json | Task 1 Step 1 |
| 7.1 菜单数据 | Task 2 Step 1 |
| 7.2 选择器配置 | Task 1 Step 3 |
| 7.3 菜单构建与插入 | Task 2 Step 1-3 |
| 7.4 waitFor | Task 1 Step 3 |
| 7.5 跳转 | Task 3 |
| 7.6 选中态 | Task 4 |
| 7.7 watch | Task 5 |
| 7.8 init 与失败处理 | Task 1 Step 3、Task 2 Step 3、Task 4 Step 2、Task 5 Step 2 |
| 8.1 菜单样式 | Task 1 Step 2 |
| 8.2 隐藏 feed-controls | Task 1 Step 2 |
| 9 生命周期与边界 | Task 5、Task 6 Step 3 |
| 11 验证方式 | Task 6 |

无遗漏章节。命名一致性已核对：`SELECTORS.fixbox`、`MENU_ITEMS`、`ORIGIN`、`waitFor`、`buildMenu`、`ensureMenu`、`refreshActive`、`navigate`、`onItemClick`、`watch`、`init` 在各任务中引用一致，无改名。
