# Changelog

## 1.1.0 — 2026-10-23

适配 **DSH Desktop 0.12.1**（harness `0.2.1-rc.2`）。

### 修复

- **桌面更新后开屏动画消失**：DSH Desktop 的更新是整包替换 `resources/`，
  `splash.html` 会被写回官方页面，插件还装着但看不到鲸鱼。
  现在宿主半边（`lib/index.js`）在每次启动时检查一次，不是本插件的页面就装回
  `dist/splash.html`；官方页面只备份一次，已是自己的页面时不重写，
  写入先落到临时文件再改名，避免留下半写页面。
- `package.json` 的 `files` 漏了 `dist/`，发行包里没有可装回的产物；已补。
- 仓库地址从 `zmr234234-jpg` 更正为 `zhang-23x`（README / package.json）。

### 变更

- `tools/build_splash.py`
  - 目标路径自动探测：`DSH_DESKTOP_RESOURCES` > `D:\deepseek\Data\DSH Desktop\resources`
    > `%LOCALAPPDATA%\Programs\dsh-desktop\resources` > `%ProgramFiles%\dsh-desktop\resources`，
    `--target` 仍可显式覆盖；
  - `--status` 增加启动器版本、`revoked` 标记、`dist/splash.html` 是否存在三项；
  - `--restore` 会写 `.dsh-deepseek-splash.revoked` 标记（让宿主半边以后不再装回），
    `--apply` 清除该标记。
- 去掉「外壳会把启动进度写进 `#progress`」的过时说法：0.12 起外壳只写
  `#title` / `#status`，`#progress` 留作空元素以兼容 0.11 及更早的启动器。
- `package.json` 增补 `test` / `render` / `install-splash` / `status` 四个脚本，
  `dsh.compatibility.dsh` 保持 `>=0.1.0-rc.5`。

### 测试

- 新增 `tools/smoke_host.mjs`（12 项，全部在临时目录里跑，不触碰真实安装）：
  装回、二次启动幂等、备份只留一次、`revoked` 生效、缺启动页 / 缺产物 /
  产物无标记时跳过并说明原因、不留 `.tmp` 暂存文件、`apply()` 在空 ctx 下不抛。
- `tools/smoke_client.mjs` 的 13 项注册契约仍全部通过。

### 兼容

- 验证环境：DSH Desktop 0.12.1 / harness 0.2.1-rc.2 / Windows 11。
- 0.11 及更早照旧可用（保留 `?theme=` 主题握手与 `#progress` 元素）。

## 1.0.0

- 首个版本：DSH Desktop 启动画面 + 可选的客户端全屏浮层，共用一份视觉源码。
