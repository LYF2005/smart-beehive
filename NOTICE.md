# 第三方资源声明（THIRD-PARTY NOTICES）

本文件依据 [LICENSE](./LICENSE)（GNU Affero General Public License v3.0）的要求，如实披露本项目所包含或依赖的第三方资源及其授权情况。本项目尊重并遵循各上游资源的原始许可条款。

---

## 1. 蜂箱三维模型与建模源码 —— Gratheon/robotic-beehive

| 项目 | 内容 |
| --- | --- |
| **上游仓库** | [github.com/Gratheon/robotic-beehive](https://github.com/Gratheon/robotic-beehive) |
| **涉及文件** | `hive-model.js`（蜂箱与 Entrance Observer 建模模块）<br>`hive-tower-data.js`（`hive-tower.glb` 原始字节 base64 内嵌数据，1,234,896 字节，SHA 校验见文件末尾） |
| **原始授权** | **GNU Affero General Public License v3.0 (AGPL-3.0)**，许可证全文见上游仓库 `LICENSE` 文件 |
| **本项目使用方式** | 将上游 ES Module 源码（`model/hive-model.js` 与 `model/vendor/observer-model.js`）去除 `import` / `export` 关键字并封装为经典脚本，建模逻辑零改动；GLB 仅做原始字节内嵌，未修改几何 / 材质 / 层级 / 尺寸 |
| **上游作者** | Gratheon 项目贡献者（详见上游仓库 Contributors 列表） |
| **版权归属** | 原始版权归上游作者所有 |

> 本项目整体采用 AGPL-3.0 授权，与上游许可一致，满足 AGPL 对衍生 / 包含作品的 copyleft 要求。AGPL-3.0 第 13 条关于网络交互提供源码的义务，由本公开仓库的源码提供予以满足。

---

## 2. 蜜蜂三维模型 —— Polyfork

| 项目 | 内容 |
| --- | --- |
| **资源** | Honeybee（`honeybee-2e4557.mjs`） |
| **来源** | [polyfork.dev/asset/honeybee-base](https://polyfork.dev/asset/honeybee-base) |
| **授权** | Polyfork 授权条款（详见 [polyfork.dev/licensing](https://polyfork.dev/licensing)）：允许在项目中通过官方 CDN 热链接使用，源代码 `.mjs` 不得再分发或自托管 |
| **本项目使用方式** | `index.html` 中通过 `import { createAsset } from 'https://polyfork.dev/cdn/honeybee-2e4557.mjs'` 从官方 CDN 加载，**未将 `.mjs` 源码复制进本仓库、未自托管、未再分发** |
| **署名** | Honeybee by Polyfork |

> 本项目遵守 Polyfork "链接不属于再分发" 的条款：浏览器直接从官方 CDN 获取模型；本项目未镜像、未代理、未将该 `.mjs` 作为独立资源分发。

---

## 3. 三维渲染引擎 —— three.js

| 项目 | 内容 |
| --- | --- |
| **版本** | three.js 0.180.0 及 `examples/jsm/` addons（OrbitControls、GLTFLoader、RoomEnvironment） |
| **来源** | [unpkg.com/three@0.180.0](https://unpkg.com/three@0.180.0/) |
| **授权** | MIT License（Copyright © 2010-2026 three.js authors） |
| **本项目使用方式** | 通过 `importmap` 从 unpkg CDN 加载，未将源码复制进本仓库 |

---

## 4. 其他依赖与资源

| 资源 | 用途 | 说明 |
| --- | --- | --- |
| `assets/apiary-ground-texture.jpg` | 蜂场地面贴图 | 项目自制 / 教学用途配图 |
| `assets/Create_a_photorealistic_seamle_*.png` | 教学配图 | AI 生成的示意配图，仅用于课堂展示 |
| `JCGT 2014` 相关算法 | `lab.html` 中引用的渲染算法 | 学术算法引用，见源码内注释链接 `https://jcgt.org/published/0007/04/01/` |

---

## 合规说明

- 本项目**未包含任何密钥、凭据或环境变量**，所有外部资源均通过公开 CDN 加载。
- 若你在此基础上再分发或商用，请自行核对上述各资源的原始授权条款，尤其是 Polyfork `.mjs` 源码的不可再分发限制。
- 如对授权有疑问，请联系项目维护者 [@zhangruixin27](https://github.com/zhangruixin27)。

---

*最后更新：2026-11-25*
