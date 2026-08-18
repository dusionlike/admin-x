# Admin X

Admin X 是一个基于 Vue 3、Vite+、Element Plus 和 NestJS 的全栈管理后台。项目以 Vite+ monorepo 组织前端、API 服务和共享代码，使用 Node.js 内置 SQLite 保存业务数据。

## 技术栈

- 前端：Vue 3 + Vue Router + Pinia + Element Plus
- 工具链：Vite+（Vite、Rolldown、Oxfmt、Oxlint、Vitest、Vite Task）
- 后端：NestJS + class-validator + JWT
- 共享：`packages/shared` 提供 API 响应、分页、用户、仪表盘等类型，以及分页和错误处理方法
- 数据：Node.js `node:sqlite` + SQLite 文件，用户、密码哈希、登录访问记录和活动日志都会持久化

界面借鉴了 `third_party/vue-vben-admin` 的工作台布局思路，包括深色侧栏、顶部工具栏、统计卡片和数据密度，但实现保持在本项目自己的 Vue + Element Plus 代码内。

当前后台还包含以下基础交互：

- 侧栏收起时先淡出文字，再完成菜单折叠，避免文字被宽度动画截断。
- 顶部通知图标只有存在未读通知时才显示红点，通知列表为空时不会显示红点。
- 顶部和登录页的主题按钮支持太阳/月亮过渡、点击位置圆形扩散切换，并通过 `localStorage` 保持选择。
- 用户菜单中的“个人资料”进入 `/profile`，资料页提供账号信息和安全设置入口。

## 目录结构

```text
apps/
├─ admin/             # Vue 管理后台，默认端口 5173
└─ api/               # NestJS API，默认端口 3000
packages/
└─ shared/            # 前后端共用类型、响应封装和分页方法
tools/
└─ deploy/             # TypeScript 部署包组装工具
third_party/
└─ vue-vben-admin/    # 只读参考项目
```

## 快速开始

环境要求：Node.js `>=22.18.0`，pnpm `11.20.0`。

```bash
vp install
vp run dev
```

`vp run dev` 会并行启动：

- 前端：<http://localhost:5173>
- API：<http://localhost:3000/api>

第一次打开登录页时，系统会检测 SQLite 是否为空，并引导你创建唯一的初始超级管理员账号。创建完成后账号信息会写入数据库，之后重启服务仍可使用该账号登录。项目不内置演示账号。

开发环境默认数据库路径为 `apps/api/data/admin-x.sqlite`，可通过 `DATABASE_PATH` 指定其他路径。密码只保存为 `scrypt` 哈希，不保存明文。

如果登录按钮提示请求失败，请确认前端和 API 都已启动，并检查浏览器访问的是 `http://localhost:5173`。开发环境下前端会把 `/api` 请求代理到 `http://localhost:3000`；如果设置了 `VITE_API_BASE_URL` 为空字符串，前端仍会回退到 `/api`。

## 一体化部署

执行下面的命令会生成一个类似 Nuxt `.output` 的前后端一体化部署包：

```bash
vp run build
```

产物位于 `.output/`：

```text
.output/
├─ package.json
├─ README.txt
└─ server/
   ├─ main.mjs       # 已内置 NestJS、Express、JWT 等服务端依赖
   └─ public/        # Vue 前端静态资源
```

将整个 `.output` 目录复制到服务器后，在该目录直接运行即可，无需再次安装项目依赖：

```bash
cp .env.example .env
# 编辑 .env 后再启动服务
node server/main.mjs
# 或
pnpm start
```

默认端口是 `3000`。服务启动时会自动读取运行目录下的 `.env` 文件，也会读取部署包中 `server` 目录旁的 `.env`；已有的系统环境变量优先于 `.env`。可参考根目录的 `.env.example` 配置 `PORT`、`JWT_SECRET`、`FRONTEND_ORIGIN` 和 `DATABASE_PATH` 等变量。部署包默认把数据库写入 `.output/data/admin-x.sqlite`。浏览器访问同一个服务地址时，前端使用相对路径请求 `/api`，NestJS 会同时托管页面和 API；Vue Router 的页面刷新也会自动回退到 `index.html`。

## 常用命令

```bash
# 检查格式和 lint
vp check

# 运行各工作区的类型检查
vp run -r check

# 运行共享包和 API 测试
vp run -r test

# 构建前后端一体化部署包
vp run build

# 单独构建各个工作区
vp run build:workspace
vp run -r build

# 一次执行检查、测试和构建
vp run ready
```

`vp <command>` 是 Vite+ 的内置命令；项目脚本使用 `vp run <script>`。例如根目录的 `dev` 脚本是并行运行两个应用，前端单独调试可使用 `vp -C apps/admin dev`，API 单独调试可使用 `vp -C apps/api dev`。`vp run build:workspace` 和 `vp run -r build` 用于开发阶段的独立工作区构建，交付服务器时使用 `vp run build` 生成 `.output`。

## API 概览

除初始化状态、初始化管理员和登录接口外，仪表盘和用户接口都要求 `Authorization: Bearer <token>`：

| 方法     | 路径                      | 用途                           |
| -------- | ------------------------- | ------------------------------ |
| `GET`    | `/api/auth/setup-status`  | 查询是否需要首次初始化         |
| `POST`   | `/api/auth/setup`         | 创建唯一的初始超级管理员并登录 |
| `POST`   | `/api/auth/login`         | 登录并获取 JWT                 |
| `GET`    | `/api/auth/me`            | 获取当前用户                   |
| `GET`    | `/api/dashboard/overview` | 获取工作台统计                 |
| `GET`    | `/api/users`              | 分页搜索用户                   |
| `POST`   | `/api/users`              | 创建用户                       |
| `PATCH`  | `/api/users/:id/status`   | 更新用户状态                   |
| `DELETE` | `/api/users/:id`          | 删除用户                       |

前端开发服务器会将 `/api` 代理到 `http://localhost:3000`。一体化部署默认使用相对路径 `/api`，也可以在构建前通过 `VITE_API_BASE_URL` 指向独立 API 地址；服务端运行时通过 `PORT` 和 `FRONTEND_ORIGIN` 调整 NestJS 配置。

## 开发约定

- 跨前后端的 DTO、响应结构和纯函数放到 `packages/shared`，不要在共享包中引入浏览器或 NestJS 运行时依赖。
- 前端请求统一经过 `apps/admin/src/api/http.ts`，页面只调用领域 API 文件。
- API 的相对导入保留 `.js` 后缀，以兼容 NodeNext 类型检查和 ESM 构建。
- Nest 控制器、守卫和服务的构造函数依赖使用显式 `@Inject(...)`，兼容 Vite+ `tsx` 开发运行时。
- API 使用 Node.js 内置 `node:sqlite` 的 `DatabaseSync`，默认数据库文件在 `apps/api/data/admin-x.sqlite`；不要把用户数据改回内存数组或硬编码账号。
- 首次初始化只能通过 `/api/auth/setup` 创建一个超级管理员；后续成员由用户管理页面设置初始密码并持久化到 SQLite。
- `third_party/vue-vben-admin` 仅用于视觉和交互参考，不作为运行时依赖。
