# 拾光工作台 / PWorkspace

Windows 上离线运行的个人桌面工作台，用于管理待办、纯文本笔记和常用链接。

当前版本：**v0.1.0 开发基线**。主要功能已实现，可进行开发预览；完整桌面回归、安装包验证和日常试用尚未完成，不应视作已验收的正式版本。

## 技术结构

- 界面：Vue 3、TypeScript、Vue Router、Pinia、Element Plus。
- 桌面：Electron、受控的 preload/IPC 接口。
- 本地数据：SQLite、better-sqlite3。
- 工程：electron-vite、electron-builder、Vitest、Playwright。

```text
src/main       窗口、业务服务、数据库、备份恢复、日志
src/preload    向界面提供有限的桌面能力
src/renderer   页面、组件、状态和样式
src/shared     类型、通信通道、日期工具
tests          数据读写、输入规则、备份与迁移测试
scripts        开发、构建、图标和桌面测试入口
```

## 开发预览

要求 Windows x64、Node.js 22.12 或更新的兼容版本，以及 Git。首次安装依赖需要联网，软件本地功能支持离线使用。

在项目目录执行：

```powershell
npm.cmd ci
node scripts/dev.cjs
```

也可以在 VS Code 中打开项目，按 **Ctrl + Shift + B**，选择“拾光工作台：实时预览”。保持启动终端运行，保存页面或样式后自动更新，修改主进程或 preload 时会重新启动桌面程序。修改前先保存正在编辑的笔记。

开发预览的数据保存在项目的 `.cache/dev-profile`，与默认安装版数据分开。若 PowerShell 中的 `npm` 启动脚本异常，可先尝试 `npm.cmd`；依赖已经安装时，可以直接使用上述 `node` 启动命令。

## 检查与打包

```powershell
npm.cmd run typecheck
node scripts/test.cjs
node scripts/build.cjs
node scripts/smoke.cjs
node scripts/build.cjs pack
node scripts/smoke.cjs --packaged
node scripts/build.cjs dist
```

- 数据测试使用 Electron 的 Node 运行时，匹配 SQLite 原生驱动 ABI。
- 桌面测试会启动真实窗口，数据保存在 `.cache/smoke-*`，报告和截图写入 `test-results`。自动化中会替代系统文件选择和浏览器打开的响应；原生对话框与真实浏览器还需要人工验收。
- `pack` 输出可执行目录；`dist` 输出 Windows NSIS 安装包。产物位于 `release`。
- 安装或升级 Electron 后需要重建原生依赖：`npm.cmd run postinstall`。`npm ci` 也会执行此步骤。

## 数据与备份

默认安装版将业务数据保存在 `%APPDATA%/PersonalWorkbench/data`，日志位于同级的 `logs` 目录。设置页可以查看并打开数据目录。

- 每天首次启动创建一次自动备份，保留最近七份。
- 设置页支持手动选择位置备份；手动备份不自动删除。
- 恢复前校验备份的应用标识、结构版本和完整性，并保留恢复前快照。
- `.cache`、数据库、日志、依赖与构建产物均不提交到 Git。GitHub 中保存源码，个人业务数据通过软件自身的备份功能保存。

## 当前验收状态与下一步

最近一轮数据层测试为 **24/24 通过**，类型检查及生产构建曾通过。首轮桌面测试通过了前六组流程，在“真正退出时保护未保存笔记”场景失败；相关代码已修正，完整桌面回归尚未重新通过。

后续按阶段完成：

1. 复查未保存笔记的保存、放弃、取消，以及托盘、重复启动、离线使用、窗口尺寸和重启持久化。
2. 在最新代码上重新执行类型检查、构建和完整桌面回归。
3. 生成并验证安装包、独立运行、覆盖安装和数据保留。
4. 完善使用及升级说明，完成一周日常试用，再确定 v1.0.0。

第一版暂不包含账号、服务器、云同步、AI 助手、附件、定时提醒和自动更新。

## Git 协作约定

远程仓库：<https://github.com/Xiaolu-user/PWorkspace>

当前以 `main` 保存阶段基线。每完成一个功能或修复，检查差异、运行相关验证后提交并推送；提交说明准确区分开发中与已验收状态。较大功能另开 `feature/...` 分支。

```powershell
git status
git diff
# 检查后，在 VS Code 中暂存本次相关文件
git commit -m "fix: 修复未保存笔记的退出保护"
git push
```

阶段汇报包括完成内容、验证结果、未完成项和提交编号。正常同步使用普通 push；保留已有历史，不使用强制推送覆盖远程提交。
