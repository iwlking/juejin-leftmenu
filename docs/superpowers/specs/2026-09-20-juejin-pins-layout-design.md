# 掘金沸点左侧导航菜单插件 — 设计文档

日期：2026-09-20
状态：待实现
修订：第 2 版（第 1 版的「搬移原导航节点」方案已废弃，见第 4 节）

## 1. 背景与目标

掘金沸点页（`https://juejin.cn/pins/*`）的导航入口分散在两处：

- 中栏顶部的 `.feed-controls`，包含「推荐 / 最新 / 关注」tab、一条横向滚动的推荐圈子列表、以及「我的圈子」按钮
- 这些入口位于中栏，用户视线需要横向移动才能触达

本插件在左侧栏的常驻区块 `.fixbox` 内注入一个自定义纵向菜单，把常用入口集中到左栏，并隐藏原有的 `.feed-controls`，避免入口重复。

目标：

- 左栏「如何玩转沸点」上方出现一个自定义纵向菜单，共 6 项
- 点击菜单项执行 SPA 软跳转，不整页刷新
- 当前路由对应的菜单项高亮
- 原有 `.feed-controls` 整块隐藏
- 菜单常驻不消失：贴在「如何玩转沸点」正上方，随其一起常驻

## 2. 生效范围

`https://juejin.cn/pins/*`，即所有沸点列表页。

不覆盖文章页、个人页等其他掘金页面。

## 3. 页面真实结构

数据来源：完整的 `body` HTML 快照。整理后与本设计相关的骨架：

```
main.container.main-container
└── main.main
    ├── div.featured-sidebar.left-sidebar
    │   ├── div.list_box.pin                精选沸点，本设计不动
    │   └── div.fixbox                      常驻区块
    │       ├── div.jjp-menu                ← 插件注入的自定义菜单
    │       └── a.guide-link.top            「如何玩转沸点」，本设计不动
    ├── div.stream
    │   └── div.stream-wrapper
    │       ├── div.feed-controls           ← 整块隐藏
    │       │   └── nav.feed-navigation
    │       │       ├── div.feed-tabs-shell   推荐 / 最新 / 关注
    │       │       ├── span.separator
    │       │       ├── div.recommended-clubs 横向滚动的圈子列表
    │       │       └── span.pin-home-clubs-popover 「我的圈子」按钮
    │       ├── div.sortlist
    │       ├── div.page-header
    │       └── div.pin-list-view
    └── div.sidebar.sidebar                  右栏
        └── div.fixbox                       注意：右栏也有一个 .fixbox
```

`.main-container` 下还有一个 `nav.navigation.navigator.top`（顶部横向导航），本设计不涉及，保持原样。

两个关键事实：

1. **页面里有两个 `.fixbox`**。右栏那个装的是主题列表（`.list_box`）。本设计只操作 `.featured-sidebar.left-sidebar > .fixbox`，选择器必须带祖先限定。
2. **页面是 Vue SPA**（Nuxt + Vue Router），节点带 `data-v-78e6ad14` 这类作用域属性，路由切换不刷新页面。

## 4. 方案变更说明

第 1 版设计是「用 `insertBefore` 把 `nav.navigation.navigator.top` 搬到左栏」。该方案已废弃，原因：

- 依赖搬移后掘金 scoped 样式仍能命中，而本地拿不到掘金的 CSS 文件，无法静态验证，风险不可控
- 菜单内容需要定制（第 1 版有 11 项，实际只需要 6 项），搬移无法满足

第 2 版改为**插件自建菜单**：不依赖任何掘金组件，内容与样式完全自持，行为可预测。代价是菜单项需要写死在代码里，掘金增删圈子时插件不会自动跟随 —— 这是有意的取舍，因为本插件只服务于一组固定的常用入口。

## 5. 文件结构

零构建 MV3，不引入任何 npm 依赖、打包器或类型系统。

```
juefei/
├── manifest.json
├── src/
│   ├── content.js      全部逻辑
│   └── content.css     菜单样式 + 隐藏 feed-controls
└── docs/
    └── superpowers/specs/2026-09-20-juejin-pins-layout-design.md
```

## 6. manifest.json

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

要点：

- content script 只需要 `matches`，不需要 `permissions` 或 `host_permissions`。安装时不弹权限提示。
- 不声明 `icons`。v1 用 Chrome 默认图标。
- `content.css` 通过 manifest 注入，不需要 JS 注入。其中隐藏 `.feed-controls` 的规则必须在页面渲染出来时即生效，交给浏览器处理比 JS 更可靠。

## 7. content.js 规格

### 7.1 菜单数据

写死在文件顶部，顺序即渲染顺序：

```js
const MENU_ITEMS = [
  { label: '推荐',       path: '/pins/hot' },
  { label: '最新',       path: '/pins/new' },
  { label: '上班摸鱼',   path: '/pins/myclub/6824710203301167112' },
  { label: '理财交流圈', path: '/pins/myclub/6931179346187321351' },
  { label: '读书会',     path: '/pins/myclub/6824710202248396813' },
  { label: '树洞一下',   path: '/pins/myclub/6824710203112423437' },
];
```

`href` 由 `'https://juejin.cn' + path` 拼出，不重复维护。

> 备注：圈子页路径按要求写成 `/pins/myclub/<id>`。页面内 `feed-navigation` 用的是 `/pins/club/<id>`（同一个圈子 id `6824710203301167112` 两处都出现）。若实测跳转异常，只需把此处改成 `club`。

### 7.2 选择器配置

集中放在文件顶部：

```js
const SELECTORS = {
  fixbox: '.featured-sidebar.left-sidebar > .fixbox',
};
```

`fixbox` 带 `.left-sidebar` 前缀是刻意为之，用于避开右栏的同名 `.fixbox`。不预先声明当前用不到的 `.left-sidebar`、`.main-container` 等选择器 —— 需要时再加。

`ORIGIN = 'https://juejin.cn'` 以及超时参数 `WAIT_TIMEOUT = 10000`、轮询间隔 `POLL_INTERVAL = 200` 同样放在文件顶部集中定义。

### 7.3 菜单构建与插入

`buildMenu()` 用 `document.createElement` 生成：

```
div.jjp-menu
└── a.jjp-menu__item  × 6   href = https://juejin.cn + path
```

每项文本为 `label`，`a` 上不挂任何掘金的 class，避免被掘金的 scoped 规则命中。整个菜单类名固定为 `.jjp-menu`，供幂等判断使用。

`ensureMenu(fixbox)`

```
若 fixbox.firstElementChild 是 .jjp-menu → 直接返回
否则 fixbox.insertBefore(menu, fixbox.firstElementChild)
```

插到 `firstElementChild` 之前，即位于「如何玩转沸点」上方。这个前置判断同时承担两个职责：跳过冗余插入，以及防止 `watch()` 自激循环。

**注意伪代码里的「若 fixbox.firstElementChild 是 .jjp-menu」隐含了 menu 必须存在这一前提，实现时不能漏。** `waitFor()` 只等到 `.fixbox` 存在，没等它内部渲染完；若此刻 `.fixbox` 恰好为空，`menu` 与 `firstElementChild` 同为 `null`，省略该前提后会满足相等判断而直接返回，菜单永远插不进去。实现须写成 `if (menu && fixbox.firstElementChild === menu)`。`insertBefore(menu, null)` 的语义是追加到末尾，所以 `.fixbox` 为空时行为同样正确。

菜单跟着 `.fixbox` 走，**不需要自己写 sticky** —— 「如何玩转沸点」不消失是因为 `.fixbox` 本身是常驻定位，菜单插进同一个容器就继承了同样的行为。

### 7.4 waitFor()

Vue 异步渲染，`document_idle` 时 DOM 未必就绪。轮询等待 `SELECTORS.fixbox` 命中，最长 10 秒。

- 命中：把 `fixbox` 交给 `ensureMenu()`，然后启动 `watch()`。
- 超时：`console.warn` 输出缺失的选择器名，然后结束。不抛异常、不改动页面其他部分。

### 7.5 跳转

菜单项是真实 `<a href="https://juejin.cn/pins/hot">`，因此中键、Ctrl+点击开新标签页等原生行为照常工作。

只在**普通左键单击**时拦截，判定条件：`e.button === 0` 且 `metaKey / ctrlKey / shiftKey / altKey` 全部为假。

```
preventDefault()
try {
  history.pushState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
} catch {
  location.href = url          // 兜底：整页跳转
}
```

`pushState` 改变地址栏后派发 `popstate`，Vue Router 3 的 `popstate` 监听会读取当前 `location` 并执行软跳转，页面不刷新。

### 7.6 选中态

命中条件：`location.pathname === item.path` 精确相等。命中项加 `is-active`。

刷新时机由三处触发，合起来覆盖所有路径：

- 点击菜单项之后（此时地址已更新）
- `window` 上的 `popstate`，覆盖浏览器前进 / 后退
- `watch()` 的 MutationObserver 回调，覆盖掘金自身发起的路由切换

第三条是关键。掘金内部跳转走 Vue Router 自己的 `history.pushState`，**不会派发 `popstate`**，单靠前两条会漏掉「用户点了页面里的圈子链接」这类情况。而路由切换必然伴随中栏内容重渲染，MutationObserver 一定会触发，顺带刷新一次选中态即可。这样既不用轮询，也不用去改写 `history.pushState` 这个页面全局函数。

刷新只改 `classList`（属性变更），而观察器只订阅 `childList`，不会形成回路。

### 7.7 watch()

`MutationObserver` 监听 `main.container.main-container`，配置 `{ childList: true, subtree: true }`。

观察根选择此节点是因为它稳定存在且范围收敛 —— 从 `document.body` 观察会把右侧悬浮面板、弹层等无关变动全部收进来。它必然存在：`waitFor()` 已经等到 `.fixbox` 命中，而 `.fixbox` 就在 `.main-container` 内部。

回调做两件事：

1. 重新解析 `SELECTORS.fixbox`，命中则调用 `ensureMenu()`。Vue 重建 `.fixbox` 时会连带删除注入的菜单，这里负责补回。
2. 调用 `refreshActive()`，覆盖掘金自身发起的路由切换（见 7.6）。

不会形成循环：`ensureMenu()` 插入完成后幂等判断为真，`refreshActive()` 只改属性而不改子节点，回调空转。

`.feed-controls` 的隐藏不在观察范围内 —— 它由 CSS 承担，重建后自动重新命中。

### 7.8 init() 与失败处理

`init()` 串联：`waitFor()` → `ensureMenu()` → `watch()` → 绑定 `popstate`。

整体原则：任何一步失败都只影响插件自身，绝不把异常抛给页面。所有 DOM 操作只在元素确实存在时执行。

## 8. content.css 规格

### 8.1 菜单样式

菜单是插件自建元素，class 以 `jjp-` 前缀命名空间隔离，不存在与掘金样式的特异性冲突，因此规则干净书写，不使用 `!important`：

```css
.jjp-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 20px;
  background-color: #fff;
}

.jjp-menu__item {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 24px;
  color: #4e5969;
  text-decoration: none;
  cursor: pointer;
  transition: background-color .2s, color .2s;
}

.jjp-menu__item:hover {
  background-color: #f4f5f5;
  color: #1e80ff;
}

.jjp-menu__item.is-active {
  background-color: #eaf2ff;
  color: #1e80ff;
  font-weight: 500;
}
```

各项数值的来由：

- `margin-bottom: 20px` 用于撑开菜单整体与「如何玩转沸点」之间的间距。若实测看不到 20px，是相邻兄弟的下外边距与 `a.guide-link.top` 的上外边距发生了折叠（取两者较大值），此时改用 `padding-bottom` 承担间距。
- `padding: 10px 12px` 配 `line-height: 24px`，单项总高 44px。6 项加 5 个 2px 间隙共约 274px。
- `display: flex` + `row` + `space-between`：当前每项只有一个文本子节点，`space-between` 不产生可见差异，保留是为了后续若要往右侧加箭头或角标时布局已就位。
- 容器白底、普通项透明，只有选中项有 `#eaf2ff` 底色。

**注意**：菜单整体高度约 274px，而它挂在 `.fixbox` 内。若 `.fixbox` 是固定定位且贴近视口底部，菜单可能把内容顶出可视区。实测时重点确认这一点，必要时改为固定定位加滚动，或压缩单项高度。

配色：品牌蓝 `#1e80ff`、次级文字 `#4e5969`、hover 灰 `#f4f5f5`、选中底色 `#eaf2ff`。本地拿不到掘金的 CSS 变量定义，前三个是凭观感定的，实测不合适再微调。

### 8.2 隐藏 feed-controls

```css
.main-container .feed-controls {
  display: none !important;
}
```

**用 CSS 而非 JS**：Vue 重建该节点时样式自动重新命中，不需要监听，也不会出现「隐藏状态丢失」。

**这里使用 `!important`**：要整块移除的是一个完整组件，`display` 由掘金自己的 scoped 规则控制，不强制覆盖压不住。这是全文件唯一使用 `!important` 的地方。

## 9. 生命周期与边界

- **无持久化**：没有 storage、background service worker 或 popup。装完即用，零配置。
- **SPA 路由切换**：`/pins/hot` → `/pins/new` 不刷新页面，content script 持续存活。注入的菜单位于 `.fixbox` 内，正常情况下不被路由切换影响；若被 Vue 重建带走，`watch()` 补回。
- **切换出 `/pins/*`**：选择器匹配不到，回调空转。整页被 Vue 卸载时注入的菜单一并销毁，无需 teardown。
- **幂等**：`ensureMenu()` 的前置判断保证不会产生第二个菜单。

## 10. 非目标

以下内容明确不做：

- **不覆盖「关注」和「我的圈子」**。第 1 版设计覆盖了这两个入口，新方案的 6 项清单里没有，按清单执行。
- 不做菜单项可配置（写死）
- 不做开关面板、popup、选项页
- 不做图标
- 不做自动化测试（理由见第 11 节）
- 不覆盖 `/pins/*` 以外的掘金页面
- 不改动 `.list_box.pin`（精选沸点）和 `a.guide-link.top`

## 11. 验证方式

v1 不写自动化测试。逻辑总量约 80 行 DOM 操作与事件处理，其正确性取决于掘金线上的真实 DOM；jsdom 只能验证我自己构造的假 DOM，验证不到真实风险点，收益不抵维护成本。

验收走手工清单：

1. 打开 `chrome://extensions`，开启开发者模式，点「加载已解压的扩展程序」，选择 `juefei` 目录
2. 打开 `https://juejin.cn/pins/hot`
3. 左栏「如何玩转沸点」上方出现纵向菜单，共 6 项，顺序为 推荐 / 最新 / 上班摸鱼 / 理财交流圈 / 读书会 / 树洞一下
4. 「推荐」默认高亮
5. 逐项点击，都能跳转，且**页面不发生整页刷新**（可开 DevTools Network 面板确认无文档请求）
6. 跳转后高亮项跟随变化
7. 浏览器后退 / 前进，高亮正确
8. 中键点击菜单项能开新标签页
9. `.feed-controls` 整块（推荐/最新/关注 tab、圈子横滚条、我的圈子按钮）不可见
10. 向下滚动页面，菜单与「如何玩转沸点」保持相对位置，不脱离左栏
11. `Ctrl+Shift+R` 硬刷新后各项依然成立，且只存在一个菜单
12. Console 无报错

## 12. 已知风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Vue 重渲染 `.fixbox` 时删除注入的菜单 | 菜单消失 | `watch()` 的 MutationObserver 重新插入 |
| `pushState + popstate` 软跳转失效 | 点击菜单无反应 | 第 5 条验收项专门覆盖；实测失效则退回普通 `<a>` 整页跳转 |
| `/pins/myclub/<id>` 与页面内 `/pins/club/<id>` 不一致 | 跳转 404 或跳错 | 第 7.1 节备注，改 `MENU_ITEMS` 一处即可 |
| 掘金改版导致 `.fixbox` / `.feed-controls` 类名变化 | 插件整体失效 | 选择器集中在 `SELECTORS`，改动点单一 |
| 菜单 6 项写死，掘金增删圈子不会跟随 | 菜单内容过期 | 有意的取舍，手动改 `MENU_ITEMS` |
