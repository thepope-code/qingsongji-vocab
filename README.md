# 轻松记 · 单词发音练习室

访问网页：<https://thepope-code.github.io/qingsongji-vocab/>

收录 3,811 个词条和中文释义，按 30 个 List 排列，保留美式参考音标、英美发音切换、搜索、收藏、掌握进度和顺序播放。

## 部署和更新

网站文件在 `dist/` 中。GitHub Pages 的 Source 设为 **GitHub Actions**；每次向 `main` 提交修改都会检查词库与音频完整性并自动发布。也可以在 Actions 页面手动运行部署。

部署工作流：`.github/workflows/deploy.yml`。网页、样式、词库和音频均使用相对路径，适配 `/qingsongji-vocab/` 项目网址，无需服务器或 API 密钥。

## 本地检查

```sh
node --check dist/app.js
node scripts/verify.cjs
```

使用任意静态 HTTP 服务器提供 `dist/` 目录即可预览。不要直接以 `file://` 打开页面，因为浏览器可能禁止读取词库 JSON。

## 发音和进度

- 优先尝试百度翻译直连音频，失败时使用设备英语语音，再使用随站提供的 CMU Flite 合成美音。
- 备用合成音不是百度录音。百度直连可用性取决于外部服务与浏览器。
- 音标是自动转换的美式参考 IPA，切换英音不会改变音标。
- 收藏和掌握记录保存在当前浏览器的本地存储中。原 ChatGPT Site 的记录不会自动迁移到这个新域名，换设备也不会同步。

词汇与释义沿用用户提供的《轻松记释义版》。网站迁移保留原页面及数据。
