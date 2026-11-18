# 参与贡献

欢迎通过 [Issues](https://github.com/Xiaolu-user/PWorkspace/issues) 报告问题或讨论功能，通过 Pull Request 提交修改。

报告问题时请附 Windows 版本、应用版本、复现步骤和预期结果。截图请遮挡个人信息；不要上传数据库、备份、私密笔记或访问凭据。

开发环境与构建命令见 [README](README.md)。从 `main` 创建分支，保持改动聚焦；修改业务逻辑时增加相关测试，提交前执行：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

涉及桌面交互时运行相关 `scripts/*-smoke.cjs` 检查，说明实际验证过的行为及未验证的部分。测试使用独立数据目录，请勿读写日常使用的数据。

提交贡献时，请确认你有权提供相应代码和素材，并接受按项目 MIT 许可证分发；第三方内容保留原有许可证及来源。
