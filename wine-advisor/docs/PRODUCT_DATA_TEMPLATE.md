# 产品数据模板 - Wine Product Data Template

请按以下格式整理你的葡萄酒产品数据。可以用 Excel 或 Google Sheets，列名如下：

## 必填字段

| 列名 | 说明 | 示例 |
|------|------|------|
| **name** | 酒名（英文） | Château Margaux 2018 |
| **name_cn** | 酒名（中文，可选） | 玛歌酒庄 2018 |
| **sku** | SKU 编号 | WR-001 |
| **color** | 颜色类型 | red / white / rose / sparkling |
| **region** | 产区 | Bordeaux, France |
| **grape_variety** | 葡萄品种 | Cabernet Sauvignon, Merlot |
| **price** | 价格（CAD） | 45.99 |

## 口感与风味字段

| 列名 | 说明 | 可选值 |
|------|------|--------|
| **acid** | 酸度 | high / moderate / low |
| **tannin** | 单宁（红酒必填） | strong / medium / soft |
| **body** | 酒体 | full / medium / light |
| **sweetness** | 甜度 | dry / off-dry / sweet |
| **flavor_profile** | 主要风味描述 | 黑莓、黑醋栗、橡木、香草 |

## 补充信息字段（可选但推荐）

| 列名 | 说明 | 示例 |
|------|------|------|
| **food_pairing** | 配餐建议 | 牛排、羊排、硬质奶酪 |
| **occasion** | 适合场景 | 商务宴请、日常饮用、节日礼品 |
| **tasting_notes** | 品鉴笔记（一段话描述） | 深红色泽，浓郁的黑莓和黑醋栗香气... |
| **alcohol** | 酒精度 | 13.5% |
| **vintage** | 年份 | 2018 |
| **winery** | 酒庄名称 | Château Margaux |
| **volume** | 瓶装规格 | 750ml |

## 示例数据（一行）

```
name: Okanagan Reserve Merlot
name_cn: 奥肯那根珍藏梅洛
sku: WR-001
color: red
region: Okanagan Valley, BC, Canada
grape_variety: Merlot
price: 28.99
acid: moderate
tannin: medium
body: medium
sweetness: dry
flavor_profile: 樱桃、李子、淡淡的橡木和香草
food_pairing: 烤鸡、意面、中等硬度奶酪
occasion: 日常饮用、朋友聚会
tasting_notes: 中等酒体的梅洛，带有成熟樱桃和李子的果香，柔和的单宁，余韵中有淡淡的橡木和香草气息。
alcohol: 13.0%
vintage: 2022
winery: Okanagan Estate
volume: 750ml
```

## 注意事项

1. 每款酒一行（或一条记录）
2. 英文字段名不要改（代码需要用）
3. 风味描述可以中英文混写
4. 如果某个字段不确定，可以留空，我帮你补
5. 完成后保存为 Excel (.xlsx) 或 CSV 格式给我即可
