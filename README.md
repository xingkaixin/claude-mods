# claude-mods

Claude Code 的 mod 集合。每个 mod 是一个函数 hook 插件，可以在终端和 Claude Desktop 的 Code 标签页里运行。

| Mod | 作用 |
| --- | --- |
| [tps-meter](#tps-meter) | 实时显示模型输出速度（tokens/s） |

## 安装

在终端里执行：

```bash
claude plugin marketplace add xingkaixin/claude-mods
claude plugin install tps-meter@claude-mods
```

也可以在 Claude Code 的提示框里用斜杠命令（Desktop 不支持这种方式，请用上面的终端命令）：

```
/plugin marketplace add xingkaixin/claude-mods
/plugin install tps-meter@claude-mods
```

scope 选 `user`，这样终端和 Desktop 都会加载。装好后，在已打开的终端会话里执行 `/reload-plugins`。Desktop 需要新建一个会话才会加载。

## 查看版本和更新

查看已安装的版本：

```bash
claude plugin list
```

找到 `tps-meter@claude-mods`，`Version` 那一行就是当前安装的版本。

检查并安装新版本：

```bash
claude plugin marketplace update claude-mods   # 从 GitHub 拉取最新的 marketplace
claude plugin update tps-meter@claude-mods      # 有新版本就更新，否则提示已是最新
```

更新后，终端执行 `/reload-plugins`，Desktop 新建会话。正在运行的会话会继续使用旧版本。

最新版本号见仓库里的 `mods/<mod>/.claude-plugin/plugin.json`。

## tps-meter

模型输出时，在界面上显示实时速度（tokens/s）：

| 界面 | 位置 |
| --- | --- |
| 终端 | 提示框下方的提示行末尾，例如 `bypass permissions on (shift+tab to cycle)` 后面 |
| Desktop | 输入框下方的页脚 |

读数有两种状态：

- `⚡ 42.3 tok/s`：模型正在输出，每 250ms 刷新一次。这是按字符数估算的值。
- `· 38.1 tok/s`：输出结束。用 API 返回的 `output_tokens` 算出的精确值。

Desktop 在还没有输出时显示 `– tok/s`，看到它就说明 mod 已经加载。

### 计算方式

每次模型请求（`turn.step`）单独计算，计时从第一个输出 chunk 开始，到 `stop` chunk 结束，不包含首 token 延迟。thinking、正文和工具调用参数都算作输出。

- **实时值**：已输出字符数 ÷ 字符/token 比 ÷ 已用秒数。字符/token 比初始为 4（英文的常见值），每次请求结束后用真实的 `output_tokens` 重新校准。所以中文对话的第一次请求，实时值会偏低。
- **最终值**：`output_tokens` ÷ 从第一个 chunk 到结束的秒数。

### 限制

- 只统计主线程，subagent 的输出不计入。
- 从第一个 chunk 到结束不足 200ms 的请求不更新读数，因为这么短的耗时主要反映网络抖动，不能代表生成速度。
- 请求中断时没有 usage，读数会停在最后一次的估算值。

## 开发

### 目录结构

```
.claude-plugin/marketplace.json   # marketplace 清单，列出所有 mod
mods/<mod>/
  .claude-plugin/plugin.json      # mod 清单：name、version、description
  hooks/hooks.json                # 指向 hooks 模块
  hooks/register.tsx              # hooks 模块，导出 register(on)
  types/index.d.ts                # $.state 的类型声明（用到 $.state 时需要）
  tests/*.test.tsx                # claude plugin test 运行的测试
```

`mods/<mod>/.claude-plugin/types/` 是 Claude Code 每次加载 mod 时自动生成的类型文件，已在 `.gitignore` 中忽略。

### 新增一个 mod

1. 在 `mods/` 下新建目录，写好上面列出的文件。
2. 在 `.claude-plugin/marketplace.json` 的 `plugins` 里加一项，`source` 写 `./mods/<mod>`。
3. 在本 README 的 mod 表格里加一行，并补充这个 mod 的说明。

API 的权威参考是 Claude Code 生成的类型文件 `.claude-plugin/types/claude-code/index.d.ts`。在 Claude Code 里加载 `plugin-authoring` skill 可以获得完整的编写指南。

### 本地调试

```bash
claude --plugin-dir mods/<mod>           # 只在这次会话里从本地目录加载
claude plugin validate .                 # 检查 marketplace 和所有 mod 的清单
claude plugin validate mods/<mod>        # 检查单个 mod 的清单和 hooks 模块
claude plugin test mods/<mod>            # 运行测试
```

用 `--plugin-dir` 启动的终端会话会监听目录，保存文件后自动重新加载。

### 发布新版本

1. 修改 `mods/<mod>/.claude-plugin/plugin.json` 里的 `version`。**必须改版本号**：安装时插件会按版本号复制到本地缓存，版本号不变，`claude plugin update` 不会拉取新代码。
2. 提交并 push 到 `main`。
3. 可选：执行 `claude plugin tag mods/<mod> --push`，创建并推送 `<mod>--v<version>` 格式的 git tag。
4. 在本机按「查看版本和更新」一节执行更新。
