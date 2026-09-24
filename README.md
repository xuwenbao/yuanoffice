# 浏览器版 GenOffice

本仓库基于 [GenOffice](https://github.com/genspark-ai/genoffice)。桌面 Electron 应用保持原样，另外增加一套浏览器宿主：编辑器跑在页面里，外部 Agent 通过命令行和 MCP 驱动已打开的文档。本发行版默认不调用任何模型。

设计细节以 [docs/web-architecture.md](docs/web-architecture.md) 为准。

## 相对 GenOffice 的修改

- **浏览器宿主。** 安装一节里的构建把页面放到 `dist/web`。首页在 `/`，可以看最近打开、收藏、允许根目录里的文件夹，也可以新建 `.docx`、`.xlsx`、`.pptx`、`.pdf`。点开一个文件后，首页用同源 iframe 加载 `/app/docs/`、`/app/pdf/`、`/app/slides/` 或 `/app/sheets/`，也就是对应的桌面编辑页。
- **平台接缝。** `@genoffice/platform` 定义各宿主都必须实现的端口。`@genoffice/platform-web` 放浏览器侧的文件客户端、WebSocket 和 frame 协议；`@genoffice/platform-electron` 放桌面侧共用的小工具。每个应用再拆出 `platform-web.ts` 和 `host-web.ts`，由各自的 `vite.web.config.ts` 打进 web 包。Electron 包不包含 web 入口，web 包不包含 preload。
- **控制服务。** `genoffice serve` 只监听回环地址。每次启动生成一个 token，浏览器通过 `GET /api/session` 拿到 `HttpOnly` cookie，命令行从 `control.json` 读取。文件只能落在 `--root` 或 `GENOFFICE_ALLOWED_ROOTS` 里，并且 `realpath` 之后仍要留在这些目录内。服务提供 `/api/files`（列目录、读、原子写、新建空白文件）、`/ws`（编辑器和首页两条通道）和 `POST /mcp`。
- **在线编辑和保存分开。** `insert_content`、`replace_blocks`、`apply_ops` 只改页面里的文档，返回 `persisted: false`。`save_document` 才把字节写回原路径。`apply_ops` 可以带 `baseRevision`，对不上就返回 `revision_conflict` 并且不执行。页面断开后登记还保留一段租约（默认 15 秒）；租约内在线命令返回 `editor_disconnected`，后台写文件返回 `file_open_in_gui`。`--force` 不能越过 `source: "control-service"` 的登记。
- **命令行。** 新增 `serve` 和 `editor`。`open` 在控制服务已经运行时，把路径发给浏览器首页，而不是拉起桌面应用。
- **默认不调用模型。** `search`、`image`、`media` 留在代码里，但只有设置 `GENOFFICE_ENABLE_CLOUD=1` 才会注册。浏览器里没有应用内 AI 面板。

浏览器里目前做不到、也不会假装成功的事：

- Docs 不能导出 PDF（打印走 `window.print`）。加密 docx、Zotero、无头导出和应用内 AI 面板仍是桌面专用。
- PDF 可以打开和查看。批注、绘图、表单、页面操作的保存需要桌面 pdfium，带这些修改的保存会报错，不会写出半份文件。
- 幻灯片可以打开、改文字、变换、撤销和保存。版式、动画、批注、导出和打印在浏览器里不可用。
- 表格页能挂上，但打开工作簿需要 `xlsx-sidecar.wasm`。构建它需要 WASI SDK（`WASI_SDK_PATH` 或 `/opt/wasi-sdk`）。没有这个文件时，网格在，工作簿打不开；未改动的保存会把原始字节写回去。

## 安装

下面是给拿到本仓库源码的人用的。需要 Node.js `>=22.12`（`.nvmrc` 写的是 22）和 npm `>=10`。已安装 nvm 时，进入目录后执行 `nvm use`。

```bash
git clone https://github.com/xuwenbao/yuanoffice.git
cd yuanoffice
npm install
npm run build -w @genoffice/cli
npm run build:web -w @genoffice/docs
npm run build:web -w @genoffice/pdf
npm run build:web -w @genoffice/slides
npm run build:web -w @genoffice/sheets
npm run build:web -w @genoffice/shell
```

`npm install` 装好工作区依赖。后面几条把命令行打到 `packages/cli/dist/genoffice.cjs`，把首页和四个编辑器打到 `dist/web`。没有 WASI SDK 时这些构建仍能完成，只是表格打不开工作簿。要打开工作簿，设置 `WASI_SDK_PATH`（或安装到 `/opt/wasi-sdk`），再执行 `npm run native:wasm -w @genoffice/sheets`。

## 启动与停止

在仓库根目录执行。`--root` 是浏览器可以读写的目录，`--static` 指向安装时构建出的页面。命令会停在前台，并打印 `genoffice serve http://127.0.0.1:8787`。

```bash
packages/cli/bin/genoffice serve \
  --root "$HOME/Documents/office" \
  --port 8787 \
  --static dist/web
```

多个目录用系统的路径分隔符写在同一个 `--root` 里（macOS 和 Linux 是冒号，Windows 是分号）。也可以另外设置 `GENOFFICE_ALLOWED_ROOTS`，它会和 `--root` 合并：

```bash
packages/cli/bin/genoffice serve \
  --root "$HOME/Documents/office:$HOME/Downloads/workspace" \
  --port 8787 \
  --static dist/web
```

在这个终端按 Ctrl+C 即停止。已经执行过 `npm link -w @genoffice/cli` 时，可以把上面的 `packages/cli/bin/genoffice` 换成 `genoffice`。

## 访问方式

服务起来之后用浏览器打开：

- **首页** `http://127.0.0.1:8787/`。第一次访问会请求 `/api/session`，由它写入会话 cookie。之后首页才能列目录和打开文件。
- **单独打开一个文件**，不经过首页标签：

  ```text
  http://127.0.0.1:8787/app/<kind>/index.html?path=<URL 编码的绝对路径>
  ```

  | 扩展名  | `kind`   |
  | ------- | -------- |
  | `.docx` | `docs`   |
  | `.pdf`  | `pdf`    |
  | `.pptx` | `slides` |
  | `.xlsx` | `sheets` |

  例如 `report.docx`：

  ```text
  http://127.0.0.1:8787/app/docs/index.html?path=%2FUsers%2Fme%2FDocuments%2Foffice%2Freport.docx
  ```

  路径可以用这一行生成（把文件路径换成自己的）：

  ```bash
  python3 -c 'import urllib.parse; print("http://127.0.0.1:8787/app/docs/index.html?path=" + urllib.parse.quote("/Users/me/Documents/office/report.docx", safe=""))'
  ```

文件必须已经在允许根目录内，否则读文件返回 `outside_allowed_roots`。`.doc`、`.xls`、`.ppt` 不会进入编辑器。

## 命令行

开发检出里用 `packages/cli/bin/genoffice`（完成上面的安装之后，它会跑 `packages/cli/dist/genoffice.cjs`）。想在任意目录直接敲 `genoffice`，在仓库根目录执行 `npm link -w @genoffice/cli`。

不打开浏览器时，用法和上游一样，完整说明在 [packages/cli/README.md](packages/cli/README.md)：

```bash
genoffice info report.docx --json
genoffice convert report.md --to pdf
genoffice create --type docx --from notes.md --out notes.docx
genoffice docs read report.docx --range 0-9 --json
genoffice render report.docx --out shots/
```

浏览器服务已经在跑之后，可以用同一套命令行驱动页面：

```bash
genoffice open report.docx                         # 让首页打开这个文件
genoffice editor list
genoffice editor read --doc report.docx            # 读的是页面里的内容，含未保存修改
genoffice editor status --doc report.docx
genoffice editor apply --doc report.docx --ops edits.json   # 只改页面，不写文件
genoffice editor save --doc report.docx
genoffice editor save --doc report.docx --path copy.docx --overwrite
```

`--doc` 可以是 `editor list` 里的 editor id，也可以是文件的绝对路径。文件正在浏览器里打开时，后台的 `docs apply` 等直接改磁盘的命令会得到 `file_open_in_gui`。`--force` 对这种登记无效，要改内容走 `editor apply`，要落盘走 `editor save`。

## MCP

两条路，用途不同。

**离线文件，stdio。** `genoffice mcp` 由助手自己启动，不需要浏览器开着。工具和上面的离线命令对应（`info`、`convert`、`create_*`、`docs_read`、`docs_apply` 等）。

```bash
claude mcp add --transport stdio genoffice -- genoffice mcp
```

```jsonc
{ "mcpServers": { "genoffice": { "command": "genoffice", "args": ["mcp"] } } }
```

**在线编辑，HTTP。** 控制服务在 `POST http://127.0.0.1:8787/mcp` 上提供 JSON-RPC：`initialize`、`tools/list`、`tools/call`。请求要带 `Authorization: Bearer <token>`。token 写在控制服务的 `control.json` 里：macOS 是 `~/Library/Application Support/GenOffice/control.json`，Linux 是 `~/.config/GenOffice/control.json`，Windows 是 `%APPDATA%\GenOffice\control.json`。若设置了 `GENOFFICE_USER_DATA`，文件在那个目录下。

工具名与桌面 MCP 对齐，另加 `document_status`：

| 工具                                              | 作用                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `open_documents`                                  | 列出、读取或关闭浏览器里打开的文档。关闭有未保存修改的文档时，必须传 `unsaved: "save"` 或 `"discard"` |
| `read_document` / `read_pdf`                      | 读编辑器内存，包含未保存的修改                                                                        |
| `insert_content` / `replace_blocks` / `apply_ops` | 改 Docs 页面。返回 `persisted: false`，文件还没写                                                     |
| `apply_sheet_ops` / `apply_slide_ops`             | 改表格或幻灯片页面，同样不写文件                                                                      |
| `document_status`                                 | `dirty`、`revision`、`savedRevision`、`lastSavedAt`、`connected`                                      |
| `save_document`                                   | 写回文档自己的路径。另存到已存在的路径时要 `overwrite: true`，返回 `persisted: true`                  |

```bash
TOKEN=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.env.HOME + "/Library/Application Support/GenOffice/control.json", "utf8")).token)')

curl -s http://127.0.0.1:8787/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

curl -s http://127.0.0.1:8787/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"open_documents","arguments":{"action":"list"}}}'
```

只接受 HTTP、不自己拉起进程的客户端可以这样配：

```jsonc
{
  "mcpServers": {
    "genoffice-live": {
      "url": "http://127.0.0.1:8787/mcp",
      "headers": { "Authorization": "Bearer <token>" },
    },
  },
}
```

`Host` 必须是 `127.0.0.1` 或 `localhost` 加端口。带 `Origin` 时，它也必须是 `http://127.0.0.1:<端口>` 或 `http://localhost:<端口>`。

## 开发与上游同步

`upstream` 指向 `https://github.com/genspark-ai/genoffice.git`。当本分支是上游 `main` 的严格后代时，快进到 `upstream/main`。冲突时保留桌面行为，再把仅属于 web 的文件盖回去。每次合并记在 [docs/web-architecture.md](docs/web-architecture.md) 第 9 节；取舍记在第 2 节。

桌面开发流程没有改：`npm run dev` 起各应用的渲染进程和 shell。浏览器宿主不要用那条命令，用上面的安装步骤和 `genoffice serve`。

改这个仓库的人可以用根目录的 `Makefile`：`make init` 安装并构建，`make start`、`make stop`、`make status` 在后台管理控制服务。这是开发用的包装，不是给使用者的安装方式。

## 许可

[Apache-2.0](LICENSE)。第三方声明见 [NOTICE](NOTICE)。GenOffice 本体由 [genspark-ai/genoffice](https://github.com/genspark-ai/genoffice) 维护，本仓库只增加浏览器宿主和控制服务这一层。
