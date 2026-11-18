<p align="center"><img src="resources/icon.png" alt="大内总管猫咪图标" width="96"></p>

# 大内总管 · PWorkspace

把日常，慢慢整理好。一个离线优先的 Windows 个人桌面工作台，把待办、灵感、课程、健身和常用入口放在一起。

**v1.0.0 · Windows x64 · MIT**

[下载安装包](https://github.com/Xiaolu-user/PWorkspace/releases) · [使用与数据迁移](docs/使用说明.md) · [更新日志](CHANGELOG.md) · [反馈问题](https://github.com/Xiaolu-user/PWorkspace/issues)

![全新用户首页](docs/screenshots/first-run.png)

截图来自独立的空白测试环境。新用户没有预置待办、笔记、课表或训练记录，仅保留 64 个健身动作；点击课程和健身空状态即可开始设置。

## 可以做什么

- **待办与日历**：日期事项、提醒、每日必做；必做事项每天重置，未完成时置顶。
- **灵感与笔记**：随手记录、搜索、编辑纯文本内容。
- **常用入口**：添加应用、网页、文件或文件夹入口，快捷方式支持分类与拖入。
- **本周课程**：学期设置、多条上课安排、任意周次、单次调课、冲突提示和字号调整。
- **健身计划**：训练循环、常用模板、64 个预置动作、训练补录、CSV/JSON 导入导出及跨月／全年趋势。
- **个人外观**：日夜主题、背景图片、模块与文字大小、托盘运行和可选开机启动。
- **本地数据**：SQLite 存储，自动／手动备份，支持换电脑恢复。天气为可选联网功能。

![离线预置动作库](docs/screenshots/exercise-library.png)

## 安装与首次使用

从 [Releases](https://github.com/Xiaolu-user/PWorkspace/releases) 下载 `大内总管-1.0.0-Setup.exe`，适用于 Windows 10/11 x64。安装包未进行代码签名，Windows 可能提示未知发布者；请核对来源及随版本提供的 SHA-256 校验值。

首次使用从空数据开始。覆盖安装或卸载后重装会保留已有本机数据，避免丢失内容；如需重置或迁移，参阅[使用说明](docs/使用说明.md)。

数据默认位于 `%APPDATA%\PersonalWorkbench\data`。数据库与备份未加密，请妥善保管。备份包含应用内数据与设置，不包含入口指向的外部资料文件或应用程序。

## 从源码运行

要求 Windows x64、Node.js 22.12 或更新的兼容版本以及 Git。安装依赖需要联网；本地业务功能支持离线使用。

```powershell
git clone https://github.com/Xiaolu-user/PWorkspace.git
cd PWorkspace
npm.cmd ci
npm.cmd run dev
```

开发数据位于 `.cache/dev-profile`，与安装版分开。`package.json` 中的 `private: true` 用于避免误发布到 npm，不影响 GitHub 开源。

技术栈：Electron、Vue 3、TypeScript、Pinia、Element Plus、SQLite、electron-vite、electron-builder、Vitest 与 Playwright。

```text
src/main       桌面窗口、业务服务、数据库与备份
src/preload    受控的桌面通信接口
src/renderer   页面、组件、状态、样式与离线资源
src/shared     数据类型与共享逻辑
tests          业务、备份、迁移和首次使用测试
scripts        开发、构建、许可清单与桌面检查
resources      应用图标、素材来源及生成记录
```

## 测试与打包

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:ui
npm.cmd run pack
node scripts/smoke.cjs --packaged
node scripts/first-run-smoke.cjs --packaged
npm.cmd run dist
```

`pack` 生成可执行目录，`dist` 生成 NSIS 安装包，均输出到 `release`。需要本机具备原生依赖构建条件；`npm ci` 会执行 SQLite Electron 适配，升级 Electron 后可运行 `npm.cmd run postinstall` 重新适配。

业务测试在 Electron 的 Node 运行时执行，以匹配 SQLite 原生模块。桌面检查使用独立的 `.cache` 目录，截图和报告位于 `test-results`，不读写日常数据。系统文件选择器、通知和浏览器打开在部分自动化中使用替身，实际系统集成与安装／升级体验仍需在目标电脑验证。

构建仅收集编译结果及必要运行依赖。个人数据库、备份、开发缓存、测试结果和设计稿不进入安装包。发布附件请单独选取安装包与公开说明，不要上传整个 `release` 目录。

## 当前范围

本版提供 Windows x64 安装包；其他平台未验证。暂无账号、云同步和自动更新。提醒需要应用保持运行，完全退出时不发送；Windows 勿扰模式可能影响通知展示。外部应用及资料入口保留本机路径，换电脑后可能需要重新选择。

## 许可证与致谢

项目采用 [MIT 许可证](LICENSE)。第三方组件遵循各自许可证，汇总见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)，构建时通过 `npm.cmd run licenses` 更新并随应用分发。

- [Electron](https://github.com/electron/electron)、[Vue](https://github.com/vuejs/core)、[Element Plus](https://github.com/element-plus/element-plus)、[better-sqlite3](https://github.com/WiseLibs/better-sqlite3) 等开源项目。
- 动作元数据由 [Free Exercise DB](https://github.com/yuhonas/free-exercise-db)（Unlicense）整理为中文；来源与许可见 [SOURCES.md](src/renderer/public/fitness/SOURCES.md) 和 [EXERCISE-LICENSE.txt](src/renderer/public/fitness/EXERCISE-LICENSE.txt)。
- 应用图标和健身卡通插画使用 AI 图像工具生成；生成记录见 [图标说明](resources/icon-prompt.md) 与[插画说明](resources/fitness/ARTWORK.md)。
- 农历与节气使用 [lunar-typescript](https://github.com/6tail/lunar-typescript)；天气和城市搜索由 [Open-Meteo](https://open-meteo.com/) 提供。

欢迎参与，参阅 [贡献说明](CONTRIBUTING.md)。
