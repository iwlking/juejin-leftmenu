# 掘金沸点左侧导航菜单

一个 Chrome 扩展（Manifest V3），把掘金沸点页的常用入口集中到左侧栏，并隐藏中栏重复的导航区。

## 做什么

在 `https://juejin.cn/pins/*` 页面上：

- 在左侧栏「如何玩转沸点」上方注入一个纵向菜单，共 6 项
- 点击菜单项执行 SPA 软跳转，不整页刷新
- 当前路由对应的菜单项高亮
- 隐藏中栏原有的 `.feed-controls`（推荐 / 最新 / 关注 tab、圈子横滚条、「我的圈子」按钮）

## 菜单项

| 顺序 | 文案 | 路径 |
| --- | --- | --- |
| 1 | 推荐 | `/pins/hot` |
| 2 | 最新 | `/pins/new` |
| 3 | 上班摸鱼 | `/pins/myclub/6824710203301167112` |
| 4 | 理财交流圈 | `/pins/myclub/6931179346187321351` |
| 5 | 读书会 | `/pins/myclub/6824710202248396813` |
| 6 | 树洞一下 | `/pins/myclub/6824710203112423437` |

这 6 项写死在 `src/content.js` 的 `MENU_ITEMS` 里，要改菜单只改这一处。

## 安装

零构建，不需要 npm，没有任何依赖。

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」，选择本目录

扩展不申请任何权限，安装时不会弹出权限提示。

## 文件

| 文件 | 职责 |
| --- | --- |
| `manifest.json` | MV3 清单，匹配 `https://juejin.cn/pins/*` |
| `src/content.js` | 全部行为逻辑 |
| `src/content.css` | 菜单样式 + 隐藏中栏导航 |

设计文档在 `docs/superpowers/specs/`，实现计划在 `docs/superpowers/plans/`。

## 已知问题

- **向下滚动页面时菜单会跟着滚走**，而「如何玩转沸点」依然可见。原因是菜单的常驻行为并不由 `.fixbox` 提供，需要让菜单自身具备固定定位。修复方案待定。

## 需要注意

页面选择器依赖掘金当前的 DOM 结构：

- `src/content.js` 中的 `.featured-sidebar.left-sidebar > .fixbox`
- `src/content.css` 中的 `.main-container .feed-controls`

掘金改版后可能失效。改动点已集中在这两处，失效时优先检查它们。
