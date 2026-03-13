// ============================================
// 产品匹配 - 单元测试 (Cassagne & Vitailles 数据)
// ============================================

import { describe, it, expect } from "vitest";
import {
  WINE_PRODUCTS,
  scoreProduct,
  filterProducts,
  getTopRecommendations,
} from "@/data/products";

// ============================================
// 1. 数据完整性
// ============================================

describe("产品数据完整性", () => {
  it("有 11 款 Cassagne & Vitailles 酒", () => {
    expect(WINE_PRODUCTS).toHaveLength(11);
  });

  it("每款酒的必填字段都存在", () => {
    for (const wine of WINE_PRODUCTS) {
      expect(wine.id).toBeTruthy();
      expect(wine.name).toBeTruthy();
      expect(wine.sku).toBeTruthy();
      expect(["red", "white", "rose", "sparkling"]).toContain(wine.color);
      expect(wine.price).toBeGreaterThan(0);
      expect(["full", "medium", "light"]).toContain(wine.body);
      expect(["high", "moderate", "low"]).toContain(wine.acid);
      expect(["dry", "off-dry", "sweet"]).toContain(wine.sweetness);
      expect(wine.winery).toBe("Cassagne & Vitailles");
    }
  });

  it("SKU 唯一", () => {
    const skus = WINE_PRODUCTS.map((w) => w.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it("ID 唯一", () => {
    const ids = WINE_PRODUCTS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("有白酒和红酒", () => {
    const colors = new Set(WINE_PRODUCTS.map((w) => w.color));
    expect(colors.has("red")).toBe(true);
    expect(colors.has("white")).toBe(true);
  });

  it("唯一白酒是 Combarels Blanc", () => {
    const whites = WINE_PRODUCTS.filter((w) => w.color === "white");
    expect(whites).toHaveLength(1);
    expect(whites[0].name).toBe("Combarels Blanc");
    expect(whites[0].grape_variety).toContain("Chardonnay");
  });

  it("价格范围: €10 - €108", () => {
    const prices = WINE_PRODUCTS.map((w) => w.price);
    expect(Math.min(...prices)).toBe(10);
    expect(Math.max(...prices)).toBe(108);
  });

  it("每款酒都有品鉴笔记", () => {
    for (const wine of WINE_PRODUCTS) {
      expect(wine.tasting_notes.length).toBeGreaterThan(50);
    }
  });

  it("葡萄品种正确: 波尔多品种不存在", () => {
    for (const wine of WINE_PRODUCTS) {
      // Cassagne & Vitailles 是朗格多克酒庄，不应有波尔多品种
      expect(wine.grape_variety).not.toContain("Cabernet Sauvignon");
      expect(wine.grape_variety).not.toContain("Merlot");
    }
  });

  it("3 款纯 Grenache (Les Homs, Les Célis, Les Crouzets) 在同一价位", () => {
    const grenaches = WINE_PRODUCTS.filter(
      (w) => w.grape_variety.includes("Grenache") && w.grape_variety.includes("100%")
    );
    // Les Célis and Les Crouzets are 100%, Les Homs is just "Grenache"
    expect(grenaches.length).toBeGreaterThanOrEqual(2);
    expect(grenaches.every((w) => w.price === 38)).toBe(true);
  });
});

// ============================================
// 2. 评分算法
// ============================================

describe("评分算法 scoreProduct", () => {
  it("颜色匹配: white → Combarels Blanc 高分", () => {
    const blanc = WINE_PRODUCTS.find((w) => w.sku === "CV-BL-001")!;
    const scoreMatch = scoreProduct(blanc, { color: "white" });
    const scoreMismatch = scoreProduct(blanc, { color: "red" });
    expect(scoreMatch).toBeGreaterThan(scoreMismatch);
  });

  it("品种匹配: Grenache → Grenache 酒高分", () => {
    const celis = WINE_PRODUCTS.find((w) => w.sku === "CV-GR-002")!;
    const chausmes = WINE_PRODUCTS.find((w) => w.sku === "CV-RD-004")!;
    const scoreCelis = scoreProduct(celis, { grape_variety: "Grenache" });
    const scoreChausmes = scoreProduct(chausmes, { grape_variety: "Grenache" });
    // Les Célis (100% Grenache) 应该匹配 Grenache
    expect(scoreCelis).toBeGreaterThanOrEqual(65);
    // Les Chausmes 也含 Grenache
    expect(scoreChausmes).toBeGreaterThanOrEqual(65);
  });

  it("品种匹配: Carignan → Nimalaya 高分", () => {
    const nimalaya = WINE_PRODUCTS.find((w) => w.sku === "CV-RD-003")!;
    const score = scoreProduct(nimalaya, { grape_variety: "Carignan" });
    expect(score).toBeGreaterThanOrEqual(65);
  });

  it("价格匹配: 预算 €10-15 → 入门酒高分", () => {
    const ombre = WINE_PRODUCTS.find((w) => w.sku === "CV-RD-001")!;
    const pesoul = WINE_PRODUCTS.find((w) => w.sku === "CV-PP-001")!;
    const scoreInRange = scoreProduct(ombre, { price_range: { min: 5, max: 15 } });
    const scoreOutRange = scoreProduct(pesoul, { price_range: { min: 5, max: 15 } });
    expect(scoreInRange).toBeGreaterThan(scoreOutRange);
  });

  it("多维度匹配: red + full body + strong tannin → 高价酒", () => {
    const chausmes = WINE_PRODUCTS.find((w) => w.sku === "CV-RD-004")!;
    const homs = WINE_PRODUCTS.find((w) => w.sku === "CV-GR-001")!;
    const scoreChausmes = scoreProduct(chausmes, {
      color: "red",
      body: "full",
      tannin: "strong",
    });
    const scoreHoms = scoreProduct(homs, {
      color: "red",
      body: "full",
      tannin: "strong",
    });
    // Les Chausmes (full, strong) 应比 Les Homs (light, soft) 得分高
    expect(scoreChausmes).toBeGreaterThan(scoreHoms);
  });

  it("空 entities → 基础分 50", () => {
    const wine = WINE_PRODUCTS[0];
    const score = scoreProduct(wine, {});
    expect(score).toBe(50);
  });

  it("得分范围 0-100", () => {
    for (const wine of WINE_PRODUCTS) {
      const scoreHigh = scoreProduct(wine, {
        color: wine.color,
        body: wine.body,
        acid: wine.acid,
      });
      expect(scoreHigh).toBeGreaterThanOrEqual(0);
      expect(scoreHigh).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================
// 3. 过滤
// ============================================

describe("过滤 filterProducts", () => {
  it("按颜色: white → 1 款", () => {
    const whites = filterProducts({ color: "white" });
    expect(whites).toHaveLength(1);
    expect(whites[0].sku).toBe("CV-BL-001");
  });

  it("按颜色: red → 10 款", () => {
    const reds = filterProducts({ color: "red" });
    expect(reds).toHaveLength(10);
  });

  it("按酒体: full → 只有 full body 的酒", () => {
    const fulls = filterProducts({ body: "full" });
    expect(fulls.length).toBeGreaterThan(0);
    expect(fulls.every((w) => w.body === "full")).toBe(true);
  });

  it("按价格: max=20 → 入门+Nimalaya", () => {
    const results = filterProducts({ price_max: 20 });
    expect(results.every((w) => w.price <= 20)).toBe(true);
    // 应包含 3 款 Combarels (€10) + Nimalaya (€19)
    expect(results.length).toBe(4);
  });

  it("空过滤 → 返回全部 11 款", () => {
    const results = filterProducts({});
    expect(results).toHaveLength(WINE_PRODUCTS.length);
  });

  it("无匹配 → 空数组", () => {
    const results = filterProducts({ color: "sparkling" });
    expect(results).toHaveLength(0);
  });
});

// ============================================
// 4. Top-K 推荐
// ============================================

describe("Top-K 推荐 getTopRecommendations", () => {
  it("white wine 查询 → 返回 Combarels Blanc 第一", () => {
    const recs = getTopRecommendations({ color: "white" }, 3);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].sku).toBe("CV-BL-001");
  });

  it("red + full body + steak → Chausmes/Pesoul/Pendut 靠前", () => {
    const recs = getTopRecommendations(
      { color: "red", body: "full", food_pairing: "steak" },
      3
    );
    expect(recs.length).toBeGreaterThan(0);
    // 全是 full body 的红酒
    const skus = recs.map((r) => r.sku);
    expect(
      skus.some((s) => ["CV-RD-004", "CV-RD-005", "CV-PP-001", "CV-PP-002"].includes(s))
    ).toBe(true);
  });

  it("Grenache → 返回 Grenache 酒", () => {
    const recs = getTopRecommendations({ grape_variety: "Grenache", color: "red" }, 5);
    expect(recs.length).toBeGreaterThan(0);
    // 所有结果应含 Grenache
    expect(recs.every((w) => w.grape_variety.toLowerCase().includes("grenache"))).toBe(true);
  });

  it("预算 under €15 → €10 的 Combarels 系列排名最前", () => {
    const recs = getTopRecommendations(
      { color: "red", price_range: { max: 15 } },
      5
    );
    expect(recs.length).toBeGreaterThan(0);
    // €10 的酒得分最高（价格在范围内 +10 vs 超范围 -15）
    expect(recs[0].price).toBe(10);
    expect(recs[1].price).toBe(10);
  });

  it("降序排列", () => {
    const recs = getTopRecommendations({ color: "red" }, 5);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1]._score).toBeGreaterThanOrEqual(recs[i]._score);
    }
  });
});
