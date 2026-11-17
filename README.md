# 贴吧助手（Tieba Helper）

一个油猴脚本，同时接管百度贴吧的**旧版**与**新版**页面：打开哪个版本，就跑那个版本的功能集。

## 安装

https://jb.tsgz.xyz/tieba-helper.user.js

需要 [Tampermonkey](https://www.tampermonkey.net/)（Violentmonkey 也可）。装好后建议把脚本的更新间隔改成 1 小时。

## 功能

### 两版共用
| 功能 | 默认 |
|---|---|
| 关键字 / 用户屏蔽 | 开 |
| 解除外链跳转 | 开 |
| 悬浮导航（顶部/底部/刷新/只看楼主/签到/楼层跳转/设置） | 开 |
| 楼层跳转下拉 | 开 |
| 一键签到（关注的全部吧） | 开 |
| 打开页面时自动签到 | 关 |
| 自动展开楼中楼 | 关 |
| 只看楼主 | 关 |

### 仅旧版
去广告、楼层气泡、用户印记、会员彩名、挽尊卡背景、底部固定栏、楼层头像、视频帖、**图片查看器**（缩放/旋转/拖动/跨楼）、贴子内直接显示大图、引用楼层、客户端排序。

### 仅新版
去推广、视频帖、楼层头像、**沉浸模式**、隐藏吧头图、限制列表带图帖高度、吧卡当前页打开、引用楼层、吧内默认「最新」、贴内默认「正序」。

## 已知限制

- 不做免登录看贴
- 旧版排序只作用于当前页
- 新版页面随官方改版可能导致部分功能失效，失效时静默降级，不会报错

## 许可

MIT。功能设计与部分选择器规则参考了以下项目，在此致谢：

- [贴吧全能助手](https://github.com/shitianshiwa/baidu-tieba-userscript)
- [梦姬贴吧助手](https://github.com/jixunmoe/yume-tieba-helper) by JixunMoe
- [百度新版贴吧优化](https://greasyfork.org/zh-CN/scripts/563339)
- [新版百度贴吧增强](https://greasyfork.org/zh-CN/scripts/561749)

---

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
