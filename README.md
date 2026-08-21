# crypto-exchange-web

加密货币交易所交易终端的前端项目，提供现货、合约、期权、OTC、杠杆、理财、风控、通知等模块的统一 Web 操作界面。

基于 **React 18 + TypeScript + Vite** 构建。

## 技术栈

- 框架：React 18
- 语言：TypeScript（strict 模式）
- 构建工具：Vite 5
- 样式：Tailwind CSS v4（`@tailwindcss/vite`）+ 既有 CSS 变量设计系统（见「样式架构」）
- UI 组件：Shadcn 风格组件（`src/components/ui/`，cva + Radix Slot + tailwind-merge）
- 状态：Zustand（客户端状态 `src/store/`）+ TanStack Query（服务端状态，`AppProviders`）
- 图表：Lightweight Charts（TradingView 官方轻量库）
- 行情：Binance 公共行情 REST/WebSocket（`src/services/binance.ts`）+ 自建后端 WS
- 路由：基于 URL hash 的轻量路由（`#/trade`、`#/wallet` …）
- 通信：`fetch` 封装的 API 客户端 + 原生 WebSocket（行情推送）

## 目录结构

```
src/
├── main.tsx                # 入口：挂载 <App/>，引入 Tailwind 入口样式
├── App.tsx                 # AppProviders + AuthProvider + hash 路由 + Layout 骨架
├── api/client.ts           # 自建后端 API 客户端、Token 管理、WebSocket 助手
├── services/binance.ts     # Binance 公共行情服务（REST + 组合 WS 流，自动重连）
├── store/                  # Zustand 客户端状态
│   ├── market-store.ts     #   自选列表 + 最新 Ticker 缓存
│   └── ui-store.ts         #   全局 UI 开关
├── hooks/                  # 复用 Hooks
│   └── use-klines.ts       #   K 线查询（TanStack Query）
├── types/index.ts          # 行情/交易领域类型（Ticker / Kline / OrderBook ...）
├── components/
│   ├── ui/                 # Shadcn 风格基础组件（button/card/badge/input/skeleton）
│   ├── layout/             # Layout = Header（吸顶导航）+ Footer
│   ├── providers.tsx       # TanStack Query 全局 Provider
│   └── ...                 # NavBar / Ticker / OrderBook / OrderForm 等业务组件
├── pages/                  # 各业务页面（Trade / Wallet / Futures / Options / Otc / Margin / Wealth / Risk / Notifications / Login / Register）
├── styles/
│   └── tailwind.css        # Tailwind v4 入口：层级策略 + @theme 令牌映射币安配色
└── styles.css              # 既有全局样式（CSS 变量多主题，被 tailwind.css 以 legacy 层引入）
```

## 样式架构（Tailwind v4 × 多主题）

- **层级**：`theme < base < components < legacy < utilities`。旧 `styles.css` 整体置于 `legacy` 层（内部优先级不变），Tailwind utilities 位于最高层可覆盖旧类；不启用 preflight，避免破坏存量页面。
- **主题令牌**：`src/styles/tailwind.css` 用 `@theme inline` 把 `bg-background` / `bg-card` / `text-muted` / `border-border` / `bg-accent`（币安黄 #FCD535）/ `bg-buy`（#0ECB81）/ `bg-sell`（#F6465D）等 utility 映射到既有 CSS 变量，自动跟随 `[data-theme]` 五套主题（dark/light/midnight/forest/solar）实时切换。
- **默认暗黑**：默认主题为 Midnight Black（`#0B0E11` 底 + `#1E2329` 面板 + 币安金点缀）。

## 页面一览

| 路由          | 模块   | 说明                         |
| ------------- | ------ | ---------------------------- |
| `#/login`     | 登录   | 手机号/邮箱 + 密码登录       |
| `#/register`  | 注册   | 注册并发送验证码             |
| `#/trade`     | 现货   | 行情条 + 订单簿（WS）+ 下单  |
| `#/wallet`    | 钱包   | 资产与流水                   |
| `#/futures`   | 合约   | 持仓 / 资金费 / 指数 / 钱包  |
| `#/options`   | 期权   | 合约与持仓                   |
| `#/otc`       | OTC    | 广告 / 订单 / 交易对手       |
| `#/margin`    | 杠杆   | 杠杆账户 / 强平价           |
| `#/wealth`    | 理财   | 产品与持仓                   |
| `#/lending`   | 借贷   | 借贷池 / 存款 / 借款 / 还款  |
| `#/bot`       | 机器人 | 网格策略 / 启停 / 订单       |
| `#/risk`      | 风控   | 规则 / 黑名单 / 事件         |
| `#/notifications` | 通知 | 后台通知列表                 |
| `#/home`         | 首页 | 公告横幅 / 模块快捷入口 / 账户概览 |
| `#/announcements`| 公告 | 公告列表（公开）             |
| `#/history`      | 历史 | 现货 / 合约订单与成交流水分 Tab |
| `#/settings`     | 设置 | 资料 / 偏好 / TFA / KYC      |
| `#/apikeys`      | API Key | 用户 API 密钥管理         |
| `#/monitor`      | 监控 | 前端监控看板（服务端聚合）   |
| `#/admin`        | 管理总览 | 后台 KPI 总览（admin）     |
| `#/audit`        | 审计 | 后台操作审计日志（admin）     |

受保护页面在无 `cx_access_token` 时会自动跳转登录页。

## 开发与构建

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 类型检查 + 生产构建，产物在 dist/
npm run build

# 本地预览构建产物
npm run preview
```

## 本地开发 Mock 网关（仅联调用）

> **重要**：本仓库的 `mock/` 目录只是**前端开发联调用的内存 mock**（Node + express + ws，无持久化，重启即重置），**不是生产后端**。生产后端是独立仓库 [`crypto-exchange`](../crypto-exchange)（Go 网关 + 撮合等核心服务）。前端通过 `BACKEND_TARGET` 切换对接目标，业务接口契约保持 `/api/v1/*` 不变。

前端在开发期需要一个后端来提供 `/api/v1/*` 业务接口与行情 WebSocket。仓库内提供一个**整合后的 mock 网关** `mock/gateway.mjs`：单进程监听 `:8787`，覆盖前端 `src/api/client.ts` 调用的全部业务端点（现货深度/下单/订单/成交、行情 Ticker、K 线、OTC 广告/订单/对手方/沟通、钱包流水、合约、期权、杠杆、理财、风控、通知、用户资料与偏好/TFA/KYC、公告、API Key、管理总览/审计、监控上报与聚合），以及三类行情 WebSocket（`/api/v1/spot/ws`、`/api/v1/market/ws`、`/api/v1/market/kline/ws`）。

启动（会自动安装 `mock/` 依赖并运行）：

```bash
npm run dev:mock
```

随后在另一个终端启动前端即可（`vite` 代理 `/api` 指向 `:8787`）：

```bash
npm run dev
```

说明：

- 数据为**内存 mock**，无持久化，仅用于联调；重启即重置。
- 登录演示账号（见 `mock/gateway-auth.mjs` 顶部种子）：`admin@ce.dev` / `op@ce.dev` / `user@ce.dev`（密码分别为 `Admin@123` / `Op@123` / `User@123`）。角色分别为 `admin` / `operator` / `user`，对应前端 RBAC。
- 之前分散的骨架服务（`kline-server.mjs` / `monitor-server.mjs` / `apikey-express.mjs` / `admin-api.mjs`）仍可作为独立 mock 运行（`npm --prefix mock run start:*`），但**统一网关已覆盖其全部能力**，日常开发只需运行 `dev:mock` 一个进程。
- 监控上报端点 `POST /api/v1/monitor/report`，聚合查询 `GET /api/v1/monitor/summary` 与 `GET /api/v1/monitor/events?limit=`（前端监控看板页读取）。

## 后端对接（Vite 代理）

开发服务器通过 Vite 代理将 `/api` 转发到后端（默认指向本地 mock 网关 `http://localhost:8787`），
REST 与 WebSocket（行情推送）共用该代理（`vite.config.ts` 中 `ws: true` 支持协议升级），
因此前端统一使用相对路径调用，无需处理跨域。

- 对接真实后端（crypto-exchange Go 网关）：`BACKEND_TARGET=http://<go-gateway>:<port> npm run dev`
- API 前缀：`/api/v1/...`
- WebSocket：`/api/v1/spot/ws`、`/api/v1/market/ws`

后端未启动时，开发页面可正常渲染，但数据接口会报错。

## API 客户端说明

`src/api/client.ts` 封装了统一请求逻辑：

- **Token 管理**：`access_token` / `refresh_token` / `user_id` 存于 `localStorage`，由 `tokenStore` 统一管理。
- **自动刷新**：请求返回 `401` 时，自动用 `refresh_token` 换取新 `access_token` 并重试一次；刷新失败则清除登录态。
- **响应解包**：统一解包 `{ code, message, data }` 结构，直接返回 `data`。
- **WebSocket 助手**：`connectSpotWS`（深度 + 成交推送）、`connectMarketWS`（Ticker 快照），均返回取消订阅函数。

## 环境变量

当前通过 Vite 代理默认指向 `localhost:8787`（本地 mock 网关），如要对接其他后端地址（如 crypto-exchange Go 网关），设置 `BACKEND_TARGET` 环境变量或修改 `vite.config.ts` 中的 `server.proxy.target` 即可。如需运行时配置，可补充 `.env` 并配合 `import.meta.env`（已在 `.gitignore` 中忽略）。

以下变量可在启动各 `mock/` 进程前设置，用于覆盖默认监听端口（mock 统一网关已覆盖全部能力，日常只需关心 `GATEWAY_PORT` 与前端代理目标）：

| 变量 | 作用域 | 默认值 | 说明 |
| ---- | ------ | ------ | ---- |
| `GATEWAY_PORT` | `mock/gateway.mjs` | `8787` | mock 网关监听端口；前端开发默认对接它 |
| `BACKEND_TARGET` | `vite.config.ts` | `http://localhost:8787` | Vite 代理 `/api` 的目标地址（含协议与端口）；对接真实后端时设置 |
| `ADMIN_PORT` | `mock/admin-api.mjs` | `8801` | 独立管理 API 骨架服务端口（统一网关已内置，无需单独运行） |
| `KLINE_PORT` | `mock/kline-server.mjs` | `8802` | 独立 K 线 WebSocket 骨架服务端口 |
| `MONITOR_PORT` | `mock/monitor-server.mjs` / `monitor-express.mjs` | `8803` | 独立监控骨架服务端口 |
| `APIKEY_PORT` | `mock/apikey-express.mjs` / `apikey-server.mjs` | `8804` | 独立 API Key 骨架服务端口 |
| `MONITOR_API_KEY` | 监控 Express 版 | 未设置（关闭校验） | 设置后，`/api/v1/monitor/*` 请求须带 `X-Api-Key` 头 |

> 说明：开发环境 mock 网关监听 `:8787`，历史上曾与宿主机上其他服务常用的 `:8080` 冲突，因此本项目已整体迁移到 `:87xx` / `:88xx` 段，**不再占用 `:8080`**。

## 端口配置（开发 / 生产）

本仓库所有端口分配如下，避免开发 mock 与宿主机其他进程（尤其是 `:8080`）争用：

### 开发环境

| 端口 | 服务 | 启动方式 | 备注 |
| ---- | ---- | -------- | ---- |
| `5173`（Vite 默认，占用时顺延 `5174`…） | 前端开发服务器 | `npm run dev` | Hash 路由 SPA，经 Vite 代理访问后端 |
| `8787` | mock 统一网关（全量业务 + 行情 WS + 监控聚合，仅联调） | `npm run dev:mock` | **日常开发只需这一个 mock 进程**；对接真实后端时改用 `BACKEND_TARGET` |
| `8801` | 管理 API 骨架（独立 mock） | `npm --prefix mock run start:admin` | 统一网关已覆盖，可不选 |
| `8802` | K 线 WS 骨架（独立 mock） | `npm --prefix mock run start:kline` | 统一网关已覆盖，可不选 |
| `8803` | 监控骨架（独立 mock） | `npm --prefix mock run start`（零依赖）或 `start:express`（Express 版） | 统一网关已覆盖，可不选 |
| `8804` | API Key 骨架（独立 mock） | `npm --prefix mock run start:apikey` | 统一网关已覆盖，可不选 |

> 前端通过 Vite 代理把 `/api`（REST 与 WebSocket 同前缀）转发到目标后端，因此前端代码始终使用相对路径，无需感知具体端口；若要对接别的后端，改 `vite.config.ts` 的 `proxy.target`（或设 `BACKEND_TARGET`）即可。

### 生产环境

| 端口 | 服务 | 说明 |
| ---- | ---- | ---- |
| `80`（或 `443`） | Nginx 静态托管 + 反向代理 | 对外暴露；`dist/` 静态资源 + `/api` 反向代理 |
| 按 crypto-exchange 部署为准 | 后端网关（[`crypto-exchange`](../crypto-exchange) Go 项目） | Nginx `location /api { proxy_pass http://<backend>; }` 转发；WebSocket 的 `Upgrade`/`Connection` 头须透传 |

> 关键点：生产环境**不经过 Vite 代理**，也**绝不部署本仓库的 `mock/`**——必须由 Nginx（或你的网关）把 `/api` 反向代理到 crypto-exchange Go 后端的网关地址，否则接口与行情 WS 都会 404。WebSocket 的 `Upgrade`/`Connection` 头必须正确透传。

## 部署

本项目是纯静态 SPA，构建产物为 `dist/` 目录，可托管到任意静态服务器（Nginx、CDN、对象存储等）。

### 1. 构建

```bash
npm install
npm run build      # 产物输出到 dist/
```

### 2. 静态托管（以 Nginx 为例）

由于使用 **hash 路由**（`#/trade` 等），URL 路径不会变化，所有请求都由服务器返回同一个 `index.html`，**无需配置 history fallback / 路由重写**。

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    # 静态资源
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 将 /api 反向代理到后端网关（REST 与 WebSocket 同前缀；地址以 crypto-exchange 实际部署为准）
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;       # 支持 WebSocket 升级
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

> 关键点：生产环境**不会**经过 Vite 代理，因此需要由 Nginx（或你使用的网关）自行把 `/api` 反向代理到 crypto-exchange Go 后端的网关监听地址（端口以其项目配置为准），否则所有接口与行情 WS 都会 404。WebSocket 的 `Upgrade`/`Connection` 头必须正确透传。**切勿把 `/api` 指到本仓库的 `mock/` 网关**——它只是开发联调工具，数据为内存假数据。

### 3. 其他托管方式

- **`npm run preview`**：直接用 Vite 预览构建产物（仍走 `vite.config.ts` 代理）。
- **对象存储 / CDN**：上传 `dist/` 全部内容，并配置默认文档为 `index.html`；`/api` 需由独立网关或边缘函数转发到后端。

## 故障排查

| 现象 | 可能原因 | 排查 / 解决 |
| ---- | -------- | ----------- |
| 页面能打开，但所有数据为空 / 接口报错 | 后端未启动或地址不对 | 开发环境确认 mock 网关在 `:8787` 监听（`npm run dev:mock`）或 `BACKEND_TARGET` 指向真实后端；检查 `vite.config.ts` 的 `proxy.target`，生产环境检查反向代理配置 |
| 接口返回 404（`/api/...`） | 生产环境未配置反向代理 | 在 Nginx（或网关）中增加 `location /api { proxy_pass ... }`，不要依赖 Vite 代理 |
| WebSocket 连不上 / 行情不刷新 | `Upgrade` 头未透传，或后端 WS 地址错误 | 检查反向代理是否透传 `Upgrade`/`Connection`；确认 `wss://` 在 HTTPS 下可用 |
| 一直跳回登录页 / 登录后立即失效 | `access_token` 过期且刷新失败 | 清除 `localStorage` 中的 `cx_access_token` 等键重新登录；确认后端 `/api/v1/user/refresh` 正常 |
| 反复 401 刷新循环 | `refresh_token` 失效或被多处并发刷新 | 客户端已用单例 `refreshing` 防止并发；如无效应清除登录态重新登录 |
| 跨域（CORS）报错 | 前端直连后端而非经代理/反代 | 开发用 Vite 代理、生产用反向代理，统一走相对路径 `/api`，避免直连 `http://localhost:8787` |
| `npm run build` 失败 | TypeScript 严格模式报错 | 查看 `tsc -b` 输出，按报错逐条修复类型问题（开启了 `noUnusedLocals`/`noUnusedParameters` 等） |
| 开发服务器启动在别的端口 / 端口被占 | 默认 `5173` 已被占用 | Vite 会自动顺延到 `5174`…；或显式指定 `--port`/`--host` |
| 改动不生效 | 浏览器缓存了旧 `dist` | 构建后强刷浏览器（禁用缓存）或重新部署静态资源 |

> 调试技巧：浏览器打开 DevTools → Network，筛选 `/api` 请求，查看状态码与响应体 `{ code, message, data }`，可快速定位是前端调用问题还是后端返回问题。

## 性能优化

### 现有做法（代码中已实现）

- **实时优先于轮询**：行情（`Ticker`/`OrderBook`）优先走 WebSocket 推送，仅在 WS 未连接或静默时回退 2s 一次的 REST 轮询，避免高频轮询打满请求。
- **卸载守卫**：所有数据组件用 `let alive = true` + `useEffect` 清理函数，组件卸载后不再 `setState`，避免内存泄漏与“卸载后更新”告警。
- **WebSocket 资源回收**：`connectSpotWS` / `connectMarketWS` 返回 `() => ws.close()`，在依赖变化或卸载时正确关闭连接，防止连接泄漏。
- **订单簿 DOM 收敛**：`OrderBook` 用 `slice(0, 10)` 只渲染买卖盘前 10 档，控制渲染节点数，避免深度数据撑大 DOM。

### 已落地的额外优化（本仓库新增）

| 优化项 | 做法 |
| ------ | ---- |
| 路由级代码分割 | 所有业务页面改为 `React.lazy` + `Suspense` 按需加载；首屏主包由约 370KB 降至约 258KB，各页面产物为独立 chunk |
| WS 推送节流 | `Ticker` / `OrderBook` 的 WS `onmessage` 合并 ≥100ms 内的多次推送，减少无谓 `setState` |
| WS 在线暂停轮询 | 行情 WS 在线（`live=true`）时 REST 兜底轮询回调直接跳过，省流量；断线恢复后继续轮询 |
| 行级 `React.memo` | 订单簿行抽为 `memo` 组件，避免父组件无关重渲染 |
| 构建体积分析 | `npm run build:analyze` 生成 `dist/stats.html`（treemap，含 gzip/brotli 体积） |

> 大列表虚拟化（`react-window`）：当前订单簿/通知等列表规模较小（订单簿仅渲染前 10 档），暂未引入；若后续列表显著变长，再按需接入。
> 静态资源长缓存（`Cache-Control: immutable`）与 `gzip`/`brotli` 压缩属于生产部署项，由托管层（Nginx/CDN）配置，见下文「部署」。

### 可进一步优化的方向

| 方向 | 建议 |
| ---- | ---- |
| 高频推送节流 | WS 行情可能每秒多次，可在 `onmessage` 内用 `requestAnimationFrame` 或时间戳节流（如 ≥100ms）合并 `setState`，减少渲染次数（`Ticker`/`OrderBook` 当前每次推送都 setState） |
| 行级复用 | 对订单簿/列表行使用 `React.memo`，配合稳定 `key`，避免整块重渲染 |
| 大数据虚拟化 | 若订单簿深档、持仓/通知列表变长，引入虚拟列表（如 `react-window`）按需渲染可视区 |
| 路由级代码分割 | 当前所有页面经 `import` 打包进同一 bundle；可用 `React.lazy` + `Suspense` 按路由分包，首屏只加载现货页 |
| 构建体积分析 | 接入 `rollup-plugin-visualizer` 生成产物体积报告，定位大依赖 |
| 静态资源缓存 | 生产环境为 `dist/` 中的带 hash 文件名开启长效 `Cache-Control: immutable`，`index.html` 用 `no-cache` |
| 压缩 | Nginx 开启 `gzip`/`brotli`，对 JS/CSS 文本资源显著降体积 |
| 接口并发控制 | REST 兜底轮询可与 WS 状态联动：WS 在线时暂停轮询（现有实现两者并存，可在 `live` 为 true 时 `clearInterval` 进一步省流量） |

## 监控

### 前端错误监控

- API 客户端对失败统一抛出 `ApiError`（携带 `code` / `status` / `message`，见 `src/api/client.ts`）。建议在此处或 `ApiTable` 的 `catch` 中集中上报，避免散落 `try/catch` 吞掉错误。
- 接入全局捕获兜底未知错误：

  ```ts
  window.addEventListener("error", (e) => report(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => report(e.reason));
  ```

- 推荐接入 Sentry / 自建上报 SDK，按 `release`（构建版本）聚合，便于区分线上问题。

### 性能与体验指标

- 接入 `web-vitals` 采集 **LCP / CLS / INP(FID)**，监控首屏与交互体验。`web-vitals` 已作为依赖安装，`src/lib/monitor.ts` 的 `initMonitor` 启动时动态 `import("web-vitals")` 并回调 `reportVital`，上报携带 `Authorization` 头，经 `POST /api/v1/monitor/report` 进入后端聚合；监控看板「服务端聚合」区可查看 Vitals。
- 用 `performance.timing` / `PerformanceObserver` 记录各页面 `api.get` 耗时，建立接口 P95 基线。
- 行情健康度：组件已用 `live` 标记区分「实时推送 / 轮询」（见 `Ticker`/`OrderBook` 的 `dot`/`ob-foot`）。可在 `live` 由 `true→false` 时上报一次「WS 掉线」，量化推送稳定性。

### 构建与发布监控

- CI 中 `npm run build` 已包含 `tsc -b` 类型检查，类型错误即阻断发布。
- 配合体积分析插件设置 **bundle 体积预算**，超阈值时告警，防止依赖无意识膨胀。
- 上传 **source map** 到监控平台（注意生产 `.map` 不要公开托管，避免源码泄露），以便错误栈还原到源码。

### 后端查询接口约定（已由统一网关实现）

前端的 `src/api/client.ts` 已定义 `api.monitorSummary()` / `api.monitorEvents()`，
监控看板页会调用以下两个接口拉取**服务端聚合**数据（后端未实现时看板回退为「会话本地」视图）。
这两个接口与上报端点 `POST /api/v1/monitor/report` 已由 `mock/gateway.mjs` 实现（复用 `mock/monitor-store.mjs` 的内存存储与聚合逻辑），看板「服务端聚合」区现已可正常展示：

**`GET /api/v1/monitor/summary`** — 聚合统计

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "errors": 12,
    "apiErrors": 34,
    "wsDrops": 5,
    "vitals": { "LCP": 1820.5, "CLS": 0.02, "INP": 120.0, "FCP": 980.1, "TTFB": 80.3 },
    "total": 51,
    "range": "24h"
  }
}
```

**`GET /api/v1/monitor/events?limit=50`** — 事件明细（按时间倒序）

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "ts": 1723814400000,
      "type": "api_error",
      "name": null,
      "message": "请求失败",
      "code": 50001,
      "status": 500,
      "value": null,
      "meta": { "uid": "123" }
    },
    {
      "ts": 1723814300000,
      "type": "ws_drop",
      "name": "BTC_USDT",
      "message": null,
      "code": null,
      "status": null,
      "value": null
    }
  ]
}
```

> 说明：`type` 取值为 `error` / `api_error` / `vital` / `ws_drop` / `custom`；
> `vital` 类事件用 `value` 表示数值（毫秒或 CLS 无量纲），其余用 `status`/`code`。
> 响应沿用项目统一的 `{ code, message, data }` 包裹（前端 `request()` 会自动解包 `data`）。
> 上报侧对应 `initMonitor` 的 `endpoint`（默认 `POST /api/v1/monitor/report`），后端需同时提供写入与查询两端。
> 可运行的骨架示例见 `mock/`：
> - `monitor-server.mjs`（零依赖 Node 内置 http 版，`node monitor-server.mjs` 直接运行）
> - `monitor-express.mjs`（Express 版，路由更易扩展中间件；`cd mock && npm install && npm run start:express`）
> - 两者共用 `monitor-store.mjs` 的内存存储与聚合逻辑，生产请替换为 DB/消息队列。
> - Express 版内置 `X-Api-Key` 鉴权中间件：设置环境变量 `MONITOR_API_KEY` 后，所有 `/api/v1/monitor/*` 请求须带请求头 `X-Api-Key: <key>`（未设置该变量时关闭校验，仅演示用）。调用示例：
>   ```bash
>   curl -H 'X-Api-Key: secret123' http://localhost:8787/api/v1/monitor/summary
>   ```
>
> 监控骨架的测试（`mock/monitor-auth.test.mjs` 单元测试 + `mock/monitor-auth.integration.test.mjs` 集成测试 + `mock/monitor-e2e.mjs` 端到端脚本）已从根项目接入，
> 零额外依赖（仅 Express 版需 `npm install`）。在仓库根目录运行：
> ```bash
> npm test            # 自动安装 mock 依赖，依次执行 单元 → 集成 → 端到端 全部测试
> npm run test:mock   # 仅单元 + 集成
> npm run test:e2e    # 仅端到端
> ```
> 测试覆盖：鉴权纯函数、Express 中间件、真实启动 http / express 服务进程后的完整鉴权流程（无 key / 错误 key → 401，正确 key → 200，上报与聚合联动），以及端到端模拟前端上报报文并校验响应结构对齐前端类型。
