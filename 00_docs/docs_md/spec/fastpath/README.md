# Fast Path 配置目录

本目录用于维护 Fast Path Router 的可配置内容，采用“标定式维护”方式。

## 文件说明

- `dialog_qa_bank.yaml`
  - 对应 TODO: `TODO-FP-001` / `TODO-FP-002` / `TODO-FP-003`
  - 统一管理问候、工具用途问答、葡萄酒基础知识问答

- `wine_lookup_rules.yaml`
  - 对应 TODO: `TODO-FP-004`
  - 管理酒名/SKU 匹配规则、别名、模糊匹配阈值

- `wine_profile_template.yaml`
  - 对应 TODO: `TODO-FP-005`
  - 管理酒款介绍模板、字段映射、视频链接策略

- `wine_catalog.json`
  - 统一产品库 JSON（Fast Path / Full Path 共用）
  - 由 Excel 导入脚本生成，不建议手工改

- `wine_catalog.xlsx`
  - 统一产品库的人工编辑源（Excel）
  - 第一个 sheet：产品库，列结构对齐主产品库，并保留 `video_url` / `video_title`
  - 可选 sheet **`winery`**（酒庄）：列 `id`, `name_zh`, `name_en`（必填），`intro_zh`, `intro_en`, `selling_points_zh`, `selling_points_en`（选填）；导入后写入 `wine_catalog.json` 的 `wineries` 数组，供快速查询「我们代理的酒庄」「酒庄介绍」「酒庄卖点」使用。

## 维护原则

- 优先修改本目录文件，不在代码里硬编码文案。
- 每次改动应保留 ID，避免前后端映射失效。
- 大体量酒款建议通过 Excel 导入生成 JSON，不建议长期手工维护在 YAML 中。

## Excel 导入 / 导出 / 自动同步

- **数据源**：以 `wine_catalog.xlsx` 为准（第一个 sheet = 产品库，可选 sheet `winery` = 酒庄）。程序运行时读取的是 `wine_catalog.json`，由导入脚本从 Excel 生成。

- **导出（JSON → Excel）**：若当前只有 JSON、需要生成或刷新 Excel 时，在 `wine-advisor` 目录执行：
  - `npm run export:catalog` 或 `python scripts/export_wine_catalog.py`
  - 会根据当前 `wine_catalog.json` 生成 `wine_catalog.xlsx`（含 products + winery 两个 sheet）。

- **导入（Excel → JSON）**：编辑完 Excel 后，在 `wine-advisor` 目录执行：
  - `npm run import:catalog` 或 `python scripts/import_wine_catalog.py`
  - 会从 `wine_catalog.xlsx` 读取并更新 `wine_catalog.json`。

- **自动同步**：开发时希望「改 Excel 即自动更新 JSON」，可在 `wine-advisor` 目录执行：
  - `npm run watch:catalog`
  - 会监听 `wine_catalog.xlsx` 的变更，一旦保存即自动执行导入，无需手动跑 `import:catalog`。

