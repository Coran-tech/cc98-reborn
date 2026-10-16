# CC98 中文语义试验台

独立的本地比较工具，供手工粘贴文本、比较三个模型的实际效果。插件已有的屏蔽规则继续独立工作；本实验没有接入帖子渲染，也不会自动读取论坛内容。

## 开始测试

Windows 安装 Python 3.10–3.13 后：

1. 首次双击 `setup.cmd`，安装独立 CPU 环境并下载三个固定版本模型。
2. 双击 `start.cmd`，打开 <http://127.0.0.1:8766>。
3. 输入文字或选择人工编写的样例，点击“开始比较”。MiniLM 可填写自己的候选话题。
4. “释放”只清理模型内存；`stop.cmd` 关闭服务。若正在计算，会在当前计算结束后释放内存。

本机已完成首次真实测试，见 [实测结果与误判](RESULTS.md)。MiniLM 可切换中英文判断模板；模板须恰好包含一个 `{}`，标签和模板都会影响分数。

已安装的环境和权重保存在 `%USERPROFILE%\Documents\GitHub\cc98-semantic-lab-runtime`，不放进插件安装包。固定权重约 1.46 GB，环境另占磁盘。默认最多驻留一个模型；首次加载和切换模型的耗时会计入结果。

`setup.ps1 -RuntimeDirectory <目录>` 可更改运行目录；后续 `start.ps1`、`stop.ps1` 使用同一个参数。pip 安装默认使用当前进程直连，恢复原环境后通过系统 curl 下载模型；网络必须使用 Python 代理时可运行 `setup.ps1 -KeepProxy`。不关闭 TLS 校验、不修改系统代理。中断后重跑安装即可继续。

服务仅使用本地权重推理，没有运行时下载或远程推理接口。输入不写磁盘、日志或配置备份；内存缓存使用正文摘要、模型版本和标签参数区分，最多 128 条、保留 5 分钟。UI 显示缓存命中和原始耗时。

## 三个模型怎样使用

| 模型 | 本地实现 | 输出及边界 |
| --- | --- | --- |
| [COLD / COLDetector](https://huggingface.co/thu-coai/roberta-base-cold) | Transformers 内置 BERT，CPU float32，512 tokens | 中文冒犯二分类；softmax 的 offensive 为折叠参考分数。模型卡未单独声明权重许可证，不能据数据集许可推定权重再分发许可。 |
| [Horizon multilingual-toxicity-small](https://huggingface.co/Horizon-Labs/multilingual-toxicity-small) | 内置 ModernBERT，CPU float32，按训练长度限制为 256 tokens | 7 项独立 sigmoid 分数，toxicity 为折叠参考；模型 Apache-2.0。中文训练/评测含翻译数据，不能等同于 CC98 原生语言效果。 |
| [多语言 MiniLM NLI](https://huggingface.co/MoritzLaurer/multilingual-MiniLMv2-L6-mnli-xnli) | 内置 XLM-RoBERTa，CPU float32，512 tokens | 2–12 个自定义标签，分别比较 entailment/contradiction，默认多标签模式；MIT。是话题相关度，不生成攻击性分数。 |

确切 revision、文件大小、权重 SHA256、原始标签与来源见 `model-manifest.json`。全部固定版本、本地 safetensors，`trust_remote_code=False`。默认模型上限之外的文本会截断，结果显示 `truncated/inputTokens/processedTokens`，不能将结果理解成已经覆盖未处理的尾部。

三种分数没有统一校准，不能跨模型求平均。UI 的 80% 是可调整的折叠试验阈值，不是可靠性承诺。“观点不同”“情绪低落”“批评观点”“引用辱骂”和“人身攻击”需要分别试验；话题本身是否容易引起争论不能由毒性标签直接推出。

## 手动接入插件的屏蔽规则

在插件“屏蔽规则”的语义设置中点击“部署包”，可下载随扩展提供的独立源码 ZIP；解压后安装 Python 3.10–3.13，运行 `setup.cmd`、`start.cmd`。也可以使用本目录源码。模型和 Python 环境在本机另行安装。

1. 确认本机可以打开 `http://127.0.0.1:8766` 并完成手工比较。
2. 打开运行目录中的 `service-token.txt`，复制令牌。默认目录为 `%USERPROFILE%\Documents\GitHub\cc98-semantic-lab-runtime`；自定义运行目录时使用对应文件。
3. 在插件“屏蔽规则”底部找到“本地语义屏蔽（实验性）”，粘贴令牌，点击连接并授予浏览器的可选本地访问权限。连接会通过健康接口校验令牌；令牌正确后才保存连接，这一步不加载模型、不发送正文或进行推理。不要公开分享令牌。
4. 选择模型和阈值。MiniLM 分别填写候选标签、要屏蔽的目标标签及判断模板；可先保存后测试手写内容，再启用语义屏蔽开关。
5. 命中后可展开原文。等待、断连、错误或模型截断时不会折叠；已有用户／文本／数值规则继续工作。

开关默认关闭；只开启开关还不能连接服务，必须手动授权。断开连接会移除本机保存的令牌。个人配置备份包含模型、阈值和标签，令牌与浏览器权限需在新设备上重新接入。关闭服务可双击 `stop.cmd`。

## 插件接口

源文件 `src/semantic-client.js` 提供 UMD 客户端。导入、创建实例、清缓存均不会请求网络；实验性桥接由后台显式调用，可选权限和令牌由用户手动授权。

```js
// 未来从扩展 background 显式加载后使用，不在 content script 直接 fetch。
const client = CC98RebornSemanticClient.createClient({ token, timeoutMs: 20000 });
const abortController = new AbortController();
await client.health();
const result = await client.analyze({
  text: "可以反对观点，但请尊重发言的人。",
  model: "minilm",
  topicLabels: ["人身攻击", "正常讨论", "体育讨论"],
  hypothesisTemplate: "这段文字涉及{}。",
  multiLabel: true
}, { signal: abortController.signal });
client.clearCache();
```

插件在用户主动点击连接时请求 `optional_host_permissions: ["http://127.0.0.1/*"]`，由 background 请求固定本地端点；当前模块固定 `127.0.0.1:8766`，不接受网页传入任意服务地址。令牌不放入公开代码或个人配置备份。客户端默认 20 秒超时，插件后台为首次加载预留 60 秒；支持取消、256 KiB 响应上限、输入/响应校验、版本感知的有限内存缓存。

首次下载和加载适合先在独立试验台完成，以免扩展 service worker 的生命周期影响长请求。背景请求和可选权限边界参见 [Chrome 网络请求文档](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)、[权限文档](https://developer.chrome.com/docs/extensions/reference/api/permissions)。

## HTTP 契约 v1

固定基址 `http://127.0.0.1:8766`：

- `GET /api/v1/health`：运行状态、三个模型版本及加载情况；无 Authorization 时可公开读取，携带 Authorization 时必须通过 Bearer 令牌校验，否则返回 401。连接验证不触发模型加载或推理。
- `GET /api/v1/session`：仅本地同源页面／本机脚本获取令牌，扩展来源不可读取。
- `POST /api/v1/evaluate`：比较模型，必须带 `Authorization: Bearer <token>`。
- `POST /api/v1/models/{cold|horizon|minilm}/{load|unload}`：加载或释放，必须授权。
- `POST /api/v1/shutdown`：关闭服务，必须授权。

```json
{
  "schemaVersion": 1,
  "text": "待分析的文字",
  "models": ["cold", "horizon", "minilm"],
  "topicLabels": ["人身攻击", "正常讨论", "体育讨论"],
  "hypothesisTemplate": "这段文字涉及{}。",
  "multiLabel": true
}
```

响应 `results` 每项保留 `model/revision/task/scoreType/labels/elapsedMs/truncated`；毒性模型另含 `toxicityScore`，话题模型另含候选标签和模板。模型错误也是有版本的结构化 `error`，不会伪造分数。请求文本最多 10000 字符，标签每个最多 60 字符，正文最多 64 KiB。

服务校验 Host、精确 Origin、Bearer，不提供通配 CORS，也不监听局域网。扩展来源默认允许本项目固定 ID；其他开发版可通过 `server.py --extension-id` 明确添加。接口不接受凭证 query 参数、任意模型仓库或远程 URL。仅 `/`、`/app.js`、`/styles.css` 可作为静态文件读取。

## 验证

```powershell
python -m unittest discover -s experiments/semantic-lab/tests
node tests/semantic-client.test.js
```

契约与安全测试使用 FakeRuntime，不下载权重。实际模型结果需要安装后运行测试页面；人工样例只能用于观察，不能作为正式准确率评估。
