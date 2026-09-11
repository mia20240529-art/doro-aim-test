# Doro Aim Test

一个手机优先的准心反应速度 + 点击精准度网页小游戏。纯 HTML、CSS、JavaScript，无 Node 后端、无数据库、无第三方运行时依赖，可直接部署到 GitHub Pages。

## 本地打开

最简单的方式是直接双击 `index.html`。项目使用普通 `defer` 脚本，不需要构建步骤；推荐使用本地静态服务器进行更接近线上环境的预览：

```bash
python -m http.server 8000
```

然后打开 <http://localhost:8000>。如果当前终端不在项目目录，请先进入 `doro-aim-test` 目录。

项目入口是 `index.html`，角色素材路径是 `assets/target.png`。你可以直接替换该文件，文件名保持不变。

## 上传到 GitHub

1. 在 GitHub 新建一个空仓库，例如 `doro-aim-test`。
2. 将本目录中的文件上传到仓库根目录，或者使用 Git：

```bash
git init
git add .
git commit -m "Create Doro Aim Test"
git branch -M main
git remote add origin https://github.com/你的用户名/doro-aim-test.git
git push -u origin main
```

## 开启 GitHub Pages

进入仓库：

`Settings` → `Pages` → `Deploy from a branch`

选择：

- Branch: `main`
- Folder: `/(root)`

点击保存，等待 GitHub Pages 完成部署。最终地址通常是：

`https://你的用户名.github.io/doro-aim-test/`

本项目使用的资源路径全部是相对路径（例如 `./css/style.css`、`./js/app.js`、`./assets/target.png`），适合部署在仓库子路径下。GitHub Pages 不需要 Actions，因此没有创建 `.github/workflows`。

## 游戏与数据

- 经典、精准、疯狂模式使用设置里的游戏时长；单次反应测试固定连续 5 次。
- 头部区域与身体区域在 `js/game.js` 顶部的 `HITBOX_CONFIG` 中配置，默认头部为图片显示区域的 0%–42%。
- 点击空白区域扣 50 分并清零 Combo；头部 +250，身体 +100。
- localStorage 保存昵称、综合最佳、模式最佳、最近成绩和历史成绩前 100 条。
- 成绩卡适合手机竖屏截图分享；“复制成绩”会复制文字版成绩。
- 震动、音效、背景音乐均为可关闭设置。背景音乐使用浏览器 Web Audio 轻量生成，不依赖外部音频文件。
- 设置页提供音量滑块和“试听命中音效”。点开始或试听时主动恢复音频；如果仍无声，请检查手机媒体音量、静音模式，并尝试在 Safari / Chrome 中打开。
- 标准目标宽度约为手机屏幕的 29%，精准模式更小。经典模式轻微游移，疯狂模式加快移动，单次测试保持静止；系统“减少动态效果”也会关闭移动。移动与命中区域使用同一位置数据。
- 游戏区域使用明亮蓝灰网格，原角色图片保持不变，不再用混合效果压暗角色。

## 验证

可选的开发测试（需要本机 Node.js，游戏运行和部署均不需要）：

```bash
node tests/interaction.cjs
```

覆盖脚本共同加载、按钮绑定、移动目标计分、安全边界、单次模式静止、音频恢复、结算与本地记录。此测试模拟 DOM 和音频接口，不代替手机实机音量及画面检查。

## 角色图片说明

请把角色图片放在：

`assets/target.png`

当前代码支持透明 PNG 的近似透明像素检测；对纯白背景也会尽量视作非目标区域。如果后续换成真正透明背景的 PNG，点击判定会更准确。复杂角色轮廓仍是按比例命中框的轻量实现，便于手机流畅运行。
