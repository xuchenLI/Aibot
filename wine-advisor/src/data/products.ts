import fs from "node:fs";
import path from "node:path";

export interface WineProduct {
  id: string;
  name: string;
  name_cn: string;
  sku: string;
  color: "red" | "white" | "rose" | "sparkling";
  region: string;
  grape_variety: string;
  price: number;
  acid: "high" | "moderate" | "low";
  tannin: "strong" | "medium" | "soft" | null;
  body: "full" | "medium" | "light";
  sweetness: "dry" | "off-dry" | "sweet";
  flavor_profile: string;
  food_pairing: string;
  occasion: string;
  tasting_notes: string;
  alcohol: string;
  vintage: number;
  winery: string;
  video_url?: string;
  video_title?: string;
}

/** 酒庄条目（与 wine_catalog.json wineries / Excel winery sheet 一致） */
export interface WineryEntry {
  id: string;
  name_zh: string;
  name_en: string;
  intro_zh?: string;
  intro_en?: string;
  selling_points_zh?: string;
  selling_points_en?: string;
}

interface WineCatalogFile {
  version: string;
  products: Array<Partial<WineProduct>>;
  wineries?: Array<Partial<WineryEntry>>;
}

const FASTPATH_DIR = path.resolve(
  process.cwd(),
  "..",
  "00_docs",
  "docs_md",
  "spec",
  "fastpath"
);

function loadCatalog(): WineProduct[] {
  const fullPath = path.join(FASTPATH_DIR, "wine_catalog.json");
  const raw = fs.readFileSync(fullPath, "utf-8");
  const parsed = JSON.parse(raw) as WineCatalogFile;
  return (parsed.products ?? []).map((p) => {
    const sku = String(p.sku ?? "").trim();
    return {
      id: String(p.id ?? sku),
      name: String(p.name ?? ""),
      name_cn: String(p.name_cn ?? ""),
      sku,
      color: (p.color ?? "red") as WineProduct["color"],
      region: String(p.region ?? ""),
      grape_variety: String(p.grape_variety ?? ""),
      price: Number(p.price ?? 0),
      acid: (p.acid ?? "moderate") as WineProduct["acid"],
      tannin: (p.tannin ?? null) as WineProduct["tannin"],
      body: (p.body ?? "medium") as WineProduct["body"],
      sweetness: (p.sweetness ?? "dry") as WineProduct["sweetness"],
      flavor_profile: String(p.flavor_profile ?? ""),
      food_pairing: String(p.food_pairing ?? ""),
      occasion: String(p.occasion ?? ""),
      tasting_notes: String(p.tasting_notes ?? ""),
      alcohol: String(p.alcohol ?? ""),
      vintage: Number(p.vintage ?? 0),
      winery: String(p.winery ?? ""),
      video_url: p.video_url ? String(p.video_url) : undefined,
      video_title: p.video_title ? String(p.video_title) : undefined,
    };
  });
}

function loadWineries(): WineryEntry[] {
  const fullPath = path.join(FASTPATH_DIR, "wine_catalog.json");
  const raw = fs.readFileSync(fullPath, "utf-8");
  const parsed = JSON.parse(raw) as WineCatalogFile;
  const rows = parsed.wineries ?? [];
  return rows.map((w) => ({
    id: String(w.id ?? "").trim() || "unknown",
    name_zh: String(w.name_zh ?? ""),
    name_en: String(w.name_en ?? ""),
    intro_zh: w.intro_zh ? String(w.intro_zh) : undefined,
    intro_en: w.intro_en ? String(w.intro_en) : undefined,
    selling_points_zh: w.selling_points_zh ? String(w.selling_points_zh) : undefined,
    selling_points_en: w.selling_points_en ? String(w.selling_points_en) : undefined,
  })).filter((w) => w.name_zh || w.name_en);
}

export const WINE_PRODUCTS: WineProduct[] = loadCatalog();
export const WINERIES: WineryEntry[] = loadWineries();

/**
 * 根据条件过滤产品
 */
export function filterProducts(
  filters: Partial<{
    color: string;
    acid: string;
    tannin: string;
    body: string;
    sweetness: string;
    grape_variety: string;
    region: string;
    price_min: number;
    price_max: number;
    occasion: string;
    food_pairing: string;
    flavor_profile: string;
  }>
): WineProduct[] {
  return WINE_PRODUCTS.filter((wine) => {
    if (filters.color && wine.color !== filters.color) return false;
    if (filters.acid && wine.acid !== filters.acid) return false;
    if (filters.tannin && wine.tannin !== filters.tannin) return false;
    if (filters.body && wine.body !== filters.body) return false;
    if (filters.sweetness && wine.sweetness !== filters.sweetness) return false;
    if (filters.price_min && wine.price < filters.price_min) return false;
    if (filters.price_max && wine.price > filters.price_max) return false;
    if (filters.grape_variety) {
      const gv = filters.grape_variety.toLowerCase();
      if (!wine.grape_variety.toLowerCase().includes(gv)) return false;
    }
    if (filters.region) {
      const rg = filters.region.toLowerCase();
      if (!wine.region.toLowerCase().includes(rg)) return false;
    }
    if (filters.occasion) {
      const occ = filters.occasion.toLowerCase();
      if (!wine.occasion.toLowerCase().includes(occ)) return false;
    }
    if (filters.food_pairing) {
      const fp = filters.food_pairing.toLowerCase();
      if (
        !wine.food_pairing.toLowerCase().includes(fp) &&
        !wine.flavor_profile.toLowerCase().includes(fp)
      )
        return false;
    }
    return true;
  });
}

/**
 * 计算酒与用户偏好的匹配得分（0-100）
 */
export function scoreProduct(
  wine: WineProduct,
  entities: Record<string, unknown>
): number {
  let score = 50; // 基础分

  // 颜色匹配（最重要）
  if (entities.color && wine.color === entities.color) score += 20;
  else if (entities.color && wine.color !== entities.color) score -= 30;

  // 单宁匹配
  if (entities.tannin && wine.tannin === entities.tannin) score += 15;
  else if (entities.tannin && wine.tannin && wine.tannin !== entities.tannin)
    score -= 10;

  // 酒体匹配
  if (entities.body && wine.body === entities.body) score += 10;

  // 酸度匹配
  if (entities.acid && wine.acid === entities.acid) score += 10;

  // 甜度匹配
  if (entities.sweetness && wine.sweetness === entities.sweetness) score += 10;

  // 价格匹配
  const priceRange = entities.price_range as {
    min?: number;
    max?: number;
  } | null;
  if (priceRange) {
    if (priceRange.min && wine.price < priceRange.min) score -= 15;
    if (priceRange.max && wine.price > priceRange.max) score -= 15;
    if (
      (!priceRange.min || wine.price >= priceRange.min) &&
      (!priceRange.max || wine.price <= priceRange.max)
    )
      score += 10;
  }

  // 品种匹配
  if (entities.grape_variety) {
    const gv = (entities.grape_variety as string).toLowerCase();
    if (wine.grape_variety.toLowerCase().includes(gv)) score += 15;
  }

  // 场景匹配
  if (entities.occasion) {
    const occ = (entities.occasion as string).toLowerCase();
    if (wine.occasion.toLowerCase().includes(occ)) score += 10;
  }

  // 配餐匹配
  if (entities.food_pairing) {
    const fp = (entities.food_pairing as string).toLowerCase();
    if (wine.food_pairing.toLowerCase().includes(fp)) score += 10;
    if (wine.flavor_profile.toLowerCase().includes(fp)) score += 5;
  }

  // 风味匹配
  if (entities.flavor_profile) {
    const fl = (entities.flavor_profile as string).toLowerCase();
    if (wine.flavor_profile.toLowerCase().includes(fl)) score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 获取 Top-K 推荐
 */
export function getTopRecommendations(
  entities: Record<string, unknown>,
  k: number = 3
): Array<WineProduct & { _score: number }> {
  const scored = WINE_PRODUCTS.map((wine) => ({
    ...wine,
    _score: scoreProduct(wine, entities),
  }));

  scored.sort((a, b) => b._score - a._score);

  return scored.slice(0, k).filter((w) => w._score >= 40);
}
