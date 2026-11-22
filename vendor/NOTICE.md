# 第三方依赖与许可

教师工作台把下列依赖放在本地 `vendor/` 目录，运行时不需要联网。

| 依赖 | 用途 | 许可 |
| --- | --- | --- |
| [PDF.js](https://github.com/mozilla/pdf.js) | PDF 文字提取与页面渲染 | Apache-2.0 |
| [JSZip](https://stuk.github.io/jszip/) | DOCX 解包、备份 ZIP | MIT / GPLv3（双许可，本项目按 MIT 使用） |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 浏览器端 OCR | Apache-2.0 |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) 与 `tessdata` 语言包 | OCR 引擎与中英文识别数据 | Apache-2.0 |
| [ECDICT](https://github.com/skywind3000/ECDICT) | 本地英汉词库（`glossary.json` 由其整理而来） | MIT |
| [docx-preview](https://github.com/VolodymyrBaydalka/docx-preview) | 在浏览器里按原样式显示 Word（DOCX），供切成原题图片 | Apache-2.0 |
| [html2canvas](https://html2canvas.hertzen.com/) | 把显示的页面内容截成图片（只在本机运行） | MIT |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 在本机把任务码 / 汇报码画成二维码（不上传任何码） | MIT |
| [jsQR](https://github.com/cozmo/jsQR) | 在本机识别摄像头或图片里的二维码 | Apache-2.0 |

各依赖的完整许可文本可到对应项目仓库查看；`qrcode-generator` 与 `jsQR` 的许可原文也放在本目录的 `qrcode-generator.LICENSE`、`jsqr.LICENSE`。
