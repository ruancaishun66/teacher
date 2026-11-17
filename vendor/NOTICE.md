# 第三方依赖与许可

教师工作台把下列依赖放在本地 `vendor/` 目录，运行时不需要联网。

| 依赖 | 用途 | 许可 |
| --- | --- | --- |
| [PDF.js](https://github.com/mozilla/pdf.js) | PDF 文字提取与页面渲染 | Apache-2.0 |
| [JSZip](https://stuk.github.io/jszip/) | DOCX 解包、备份 ZIP | MIT / GPLv3（双许可，本项目按 MIT 使用） |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 浏览器端 OCR | Apache-2.0 |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) 与 `tessdata` 语言包 | OCR 引擎与中英文识别数据 | Apache-2.0 |
| [ECDICT](https://github.com/skywind3000/ECDICT) | 本地英汉词库（`glossary.json` 由其整理而来） | MIT |

各依赖的完整许可文本可到对应项目仓库查看。
