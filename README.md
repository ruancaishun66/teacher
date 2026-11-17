# 阮蔡顺 · 个人主页与教师工作台

独立英语教师个人主页，外加一个只在本机使用的教学资料库。

- 线上主页：https://ruancaishun66.github.io/teacher/
- 线上工作台：https://ruancaishun66.github.io/teacher/library.html
- 源码仓库：https://github.com/ruancaishun66/teacher
- 本地目录：`C:\Users\阮蔡顺\personal-homepage`

## 教师工作台怎么用

工作台在主页页脚的「教师工作台」入口，也可以直接访问上面的工作台地址。

**资料只保存在这台电脑的浏览器里**（IndexedDB 本机数据库），不会上传到 GitHub、网盘或任何服务器。换电脑、换浏览器、清理浏览器站点数据后，资料不会自动跟过去，所以请定期备份。

### 上传与整理

1. 打开「上传资料」，把 Word（.docx）、PDF、TXT 拖进去，或直接粘贴题目文字。
2. 页面会自动判断题型（单选、完形填空、阅读理解、五选五、语法填空、书面表达、听力等）和年级，提取文字，生成带水印的整理版，并一起存回本机资料库。
3. 识别不准确时，点资料卡上的「修改」，手动改题型、年级、标题或正文，保存后会重新拆题并更新整理版。
4. 原文件始终保留，可随时下载；「下载整理版」得到的是加水印的 Word 文档。

### 生成每日练习

在「每日练习」输入指令，例如：

```text
今日练习 高一 单选5道 阅读理解2篇 语法填空1篇
随机 10 道单选
今日练习 高三 完形填空1篇 五选五1篇 书面表达1篇
```

系统会按年级和题型随机抽题、排版预览。可以「换一组」重新抽，下载 Word，或点「打印 / PDF」后在打印窗口选择「另存为 PDF」。生成的练习卷也能存进资料库底部，方便以后复用。

### 备份与恢复

- 「备份与设置」→「导出备份」会下载一个 ZIP，里面有全部原文件、整理版、题组、练习卷和 `library.json`。
- 换电脑或清理浏览器数据前，先导出 ZIP；在新环境打开工作台，用「导入备份」选回这个 ZIP 即可合并恢复。
- 建议每周备份一次，放在网盘或移动硬盘里。

### 已知限制

- 扫描版 PDF、图片、手写内容暂时不能识别文字（没有 OCR）。
- Word 只能提取文字，复杂表格、图片和原版排版会简化；原文件仍完整保留。
- 题型识别是关键词加文本特征的自动判断，遇到冷门命名可能需要手动改一次。
- Word 里的水印是平铺文字，打印和 PDF 效果最稳定；不同版本 Word 的渲染可能略有差异。
- 工作台的数据和网址绑定：继续使用同一个浏览器、同一个线上地址最稳妥。若以后更换域名，请先导出备份。

## 以后想修改内容

### 用 Claude Code 继续

在项目目录下打开终端：

```powershell
cd C:\Users\阮蔡顺\personal-homepage
claude
```

然后直接说想改什么，例如：

> 帮我更新个人主页：把首屏的自我介绍改成……，改完提交并发布上线。

如果使用 Claude Code 桌面版，直接打开 `C:\Users\阮蔡顺\personal-homepage` 这个文件夹，新建对话即可。

也可以在新对话里直接粘贴下面这段：

> 我的个人主页项目在 `C:\Users\阮蔡顺\personal-homepage`，页面是 `index.html` 和教师工作台 `library.html`、`library.js`，线上地址是 https://ruancaishun66.github.io/teacher/ ，仓库是 `ruancaishun66/teacher`。请先读取 `index.html`、`library.html`、`library.js` 和 `README.md`，然后帮我修改并发布。

### 用编辑器手动修改

1. 用 VS Code 打开 `index.html`。文件较大（微信二维码以 base64 内嵌），建议用搜索定位文字，不要一直向下滚动。
2. 修改后保存，双击 `index.html` 即可本地预览。工作台请通过本地文件或线上地址打开，直接双击 `library.html` 也能用。
3. 发布更新：

```powershell
cd C:\Users\阮蔡顺\personal-homepage
git add index.html library.html library.js vendor README.md
git commit -m "Update homepage and teacher workbench"
git push
```

GitHub Pages 通常 1 分钟内自动更新。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `index.html` | 个人主页，所有样式、插画和微信二维码都内嵌其中 |
| `library.html` | 教师工作台页面 |
| `library.js` | 工作台逻辑：本机数据库、自动分题型、水印文档、指令抽题、备份恢复 |
| `vendor/` | 本地依赖（JSZip、PDF.js），不联网也能用 |
| `wechat-qr.png` | 微信二维码原图（已内嵌进主页） |
| `homepage-qr.png` | 指向线上主页的二维码，1200×1200，适合分享 |
| `homepage-qr.svg` | 同一二维码的矢量版，适合印刷放大 |

## 注意事项

- 不要删除或截断 `index.html` 中的 `data:image/png;base64,...` 字符串，那是页面里的微信二维码。
- 个人主页是公开的，邮箱和微信二维码会对外可见；教师工作台里的资料只存在你自己的浏览器里，不会公开。
- 不要把真实学生资料、试卷原文件提交进 git 仓库；仓库里只放网页代码和 `vendor/` 依赖。
- 首次印刷主页二维码前，建议先用手机相机和微信各扫一次确认效果。
- GitHub Pages 国内偶有访问缓慢；如果以后大量印刷宣传物料，建议绑定自己的域名，换服务器时二维码不用重印。
