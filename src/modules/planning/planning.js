import * as XLSX from "xlsx-js-style";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { db } from "../../firebase/config.js";

const COLLECTION = "planning";
const docId = (type, id) => `${type}__${id}`;

export function watchPlanningData(callback, onError) {
  return onSnapshot(collection(db, COLLECTION), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const out = {
      productionRecipes: [],
      productRecipes: [],
      salesMappings: [],
      salesRecords: []
    };
    rows.forEach(row => {
      if (row.type === "productionRecipe") out.productionRecipes.push({ ...row, id: row.recipeId || strip(row.id, "production") });
      if (row.type === "productRecipe") out.productRecipes.push({ ...row, id: row.recipeId || strip(row.id, "product") });
      if (row.type === "salesMapping") out.salesMappings.push({ ...row, id: row.mappingId || strip(row.id, "mapping") });
      if (row.type === "salesRecord") out.salesRecords.push({ ...row, id: row.salesId || strip(row.id, "sales") });
    });
    out.productionRecipes.sort(byName);
    out.productRecipes.sort((a,b) => String(a.productName || "").localeCompare(String(b.productName || ""), "id") || String(a.variant || "").localeCompare(String(b.variant || ""), "id"));
    out.salesMappings.sort((a,b) => String(a.externalProductName || "").localeCompare(String(b.externalProductName || ""), "id"));
    out.salesRecords.sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.productName || "").localeCompare(String(b.productName || ""), "id"));
    callback(out);
  }, onError);
}

export async function saveProductionRecipe(recipe = {}) {
  const id = recipe.id || crypto.randomUUID();
  const name = text(recipe.name);
  const yieldQty = positive(recipe.yieldQty);
  const outputUnit = unit(recipe.outputUnit || "ML");
  const ingredients = normalizeProductionIngredients(recipe.ingredients);
  if (!name) throw new Error("Nama batch/resep produksi wajib diisi.");
  if (!(yieldQty > 0)) throw new Error("Hasil produksi per batch harus lebih dari 0.");
  if (!ingredients.length) throw new Error("Tambahkan minimal 1 bahan stock pada resep produksi.");
  await setDoc(doc(db, COLLECTION, docId("production", id)), {
    type: "productionRecipe",
    recipeId: id,
    name,
    yieldQty,
    outputUnit,
    ingredients,
    active: recipe.active !== false,
    note: text(recipe.note),
    updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

export function removeProductionRecipe(id) {
  if (!id) throw new Error("Resep produksi tidak ditemukan.");
  return deleteDoc(doc(db, COLLECTION, docId("production", id)));
}

export async function saveProductRecipe(recipe = {}) {
  const id = recipe.id || crypto.randomUUID();
  const productName = text(recipe.productName || recipe.name);
  const variant = text(recipe.variant);
  const wasteMeasureQty = positive(recipe.wasteMeasureQty);
  const wasteMeasureUnit = unit(recipe.wasteMeasureUnit || "ML");
  const components = normalizeProductComponents(recipe.components);
  if (!productName) throw new Error("Nama produk wajib diisi.");
  if (!(wasteMeasureQty > 0)) throw new Error("Takaran produk jadi untuk konversi waste wajib lebih dari 0.");
  if (!components.length) throw new Error("Tambahkan minimal 1 komponen resep produk.");
  await setDoc(doc(db, COLLECTION, docId("product", id)), {
    type: "productRecipe",
    recipeId: id,
    productName,
    variant,
    outputUnit: text(recipe.outputUnit || "PCS") || "PCS",
    wasteMeasureQty,
    wasteMeasureUnit,
    components,
    active: recipe.active !== false,
    note: text(recipe.note),
    updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

export function removeProductRecipe(id) {
  if (!id) throw new Error("Resep produk tidak ditemukan.");
  return deleteDoc(doc(db, COLLECTION, docId("product", id)));
}

export async function saveSalesMapping(mapping = {}) {
  const id = mapping.id || mappingKey(mapping.externalProductName, mapping.externalVariant) || crypto.randomUUID();
  const externalProductName = text(mapping.externalProductName);
  const externalVariant = text(mapping.externalVariant);
  const productRecipeId = text(mapping.productRecipeId);
  if (!externalProductName) throw new Error("Nama produk dari sheet wajib diisi.");
  if (!productRecipeId) throw new Error("Pilih Product Recipe tujuan.");
  await setDoc(doc(db, COLLECTION, docId("mapping", id)), {
    type: "salesMapping",
    mappingId: id,
    externalProductName,
    externalVariant,
    normalizedKey: mappingKey(externalProductName, externalVariant),
    productRecipeId,
    active: mapping.active !== false,
    updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

export function removeSalesMapping(id) {
  if (!id) throw new Error("Mapping sales tidak ditemukan.");
  return deleteDoc(doc(db, COLLECTION, docId("mapping", id)));
}

export async function saveSalesRecord(record = {}) {
  const date = normalizeDate(record.date);
  const productName = text(record.productName);
  const variant = text(record.variant);
  const qtySold = positive(record.qtySold);
  const id = record.id || salesKey(date, productName, variant);
  if (!date) throw new Error("Tanggal sales tidak valid.");
  if (!productName) throw new Error("Nama produk sales wajib diisi.");
  if (!(qtySold > 0)) throw new Error("Qty terjual harus lebih dari 0.");
  await setDoc(doc(db, COLLECTION, docId("sales", id)), {
    type: "salesRecord",
    salesId: id,
    date,
    productName,
    variant,
    qtySold,
    productRecipeId: text(record.productRecipeId),
    source: text(record.source || "manual") || "manual",
    importBatchId: text(record.importBatchId),
    updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

export function removeSalesRecord(id) {
  if (!id) throw new Error("Data sales tidak ditemukan.");
  return deleteDoc(doc(db, COLLECTION, docId("sales", id)));
}

export async function chooseSalesFile() {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv";
    input.style.display = "none";
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0] || null;
      input.remove();
      resolve(file);
    };
    input.click();
  });
}

export async function importSalesFile(file, context = {}) {
  if (!file) throw new Error("File sales belum dipilih.");
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames.find(n => normalizeKey(n) === "sales") || wb.SheetNames[0]];
  if (!sheet) throw new Error("Sheet sales tidak ditemukan.");
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!raw.length) throw new Error("Sheet sales kosong.");

  const productRecipes = context.productRecipes || [];
  const salesMappings = context.salesMappings || [];
  const existing = new Map((context.salesRecords || []).map(x => [x.id, x]));
  const aggregate = new Map();
  let invalid = 0;

  raw.forEach(row => {
    const date = normalizeDate(pick(row, ["date","tanggal"]));
    const productName = text(pick(row, ["product_name","product name","nama produk","produk","product"]));
    const variant = text(pick(row, ["variant","varian","size","ukuran"]));
    const qtySold = positive(pick(row, ["qty_sold","qty sold","qty","terjual","jumlah terjual","jumlah"]));
    if (!date || !productName || !(qtySold > 0)) { invalid += 1; return; }
    const key = salesKey(date, productName, variant);
    const prev = aggregate.get(key) || { date, productName, variant, qtySold: 0 };
    prev.qtySold += qtySold;
    aggregate.set(key, prev);
  });

  if (!aggregate.size) throw new Error("Format sales tidak dikenali. Gunakan kolom: date, product_name, variant, qty_sold.");
  const batchId = `sales_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0,14)}`;
  let inserted = 0, updated = 0, unchanged = 0, mapped = 0, unmapped = 0;

  for (const [id, row] of aggregate.entries()) {
    const recipe = resolveProductRecipe(row.productName, row.variant, productRecipes, salesMappings);
    if (recipe) mapped += 1; else unmapped += 1;
    const old = existing.get(id);
    const same = old && Number(old.qtySold || 0) === Number(row.qtySold || 0) && String(old.productRecipeId || "") === String(recipe?.id || "");
    if (same) { unchanged += 1; continue; }
    await saveSalesRecord({
      id,
      ...row,
      productRecipeId: recipe?.id || "",
      source: "excel-import",
      importBatchId: batchId
    });
    if (old) updated += 1; else inserted += 1;
  }

  return { total: aggregate.size, inserted, updated, unchanged, invalid, mapped, unmapped, batchId, fileName: file.name };
}

export function downloadSalesTemplate() {
  const wb = XLSX.utils.book_new();
  const rows = [
    ["date","product_name","variant","qty_sold"],
    ["2026-09-01","Blooming Jasmine Milk Tea","Large",12],
    ["2026-09-01","Da Hong Pao","",18]
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{wch:14},{wch:34},{wch:16},{wch:14}];
  XLSX.utils.book_append_sheet(wb, ws, "Sales");
  XLSX.writeFile(wb, "SoWork-Sales-Import-Template.xlsx");
}

export function resolveProductRecipe(productName, variant, productRecipes = [], salesMappings = []) {
  const key = mappingKey(productName, variant);
  const mapping = salesMappings.find(x => x.active !== false && (x.normalizedKey || mappingKey(x.externalProductName, x.externalVariant)) === key);
  if (mapping) {
    const mapped = productRecipes.find(x => x.id === mapping.productRecipeId && x.active !== false);
    if (mapped) return mapped;
  }
  const exact = productRecipes.find(x => x.active !== false && mappingKey(x.productName, x.variant) === key);
  if (exact) return exact;
  if (!text(variant)) {
    const candidates = productRecipes.filter(x => x.active !== false && normalizeKey(x.productName) === normalizeKey(productName));
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

export function salesExternalKey(productName, variant) {
  return mappingKey(productName, variant);
}

function normalizeProductionIngredients(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    itemId: text(row.itemId),
    itemName: text(row.itemName),
    qty: positive(row.qty),
    unit: text(row.unit)
  })).filter(x => x.itemId && x.qty > 0);
}

function normalizeProductComponents(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    sourceType: row.sourceType === "production" ? "production" : "stock",
    sourceId: text(row.sourceId),
    sourceName: text(row.sourceName),
    qty: positive(row.qty),
    unit: text(row.unit)
  })).filter(x => x.sourceId && x.qty > 0);
}

function pick(row, names) {
  const entries = Object.entries(row || {});
  for (const name of names) {
    const found = entries.find(([key]) => normalizeKey(key) === normalizeKey(name));
    if (found) return found[1];
  }
  return "";
}

function strip(id, prefix) { return String(id || "").replace(new RegExp(`^${prefix}__`), ""); }
function byName(a,b) { return String(a.name || "").localeCompare(String(b.name || ""), "id"); }
function text(v) { return String(v ?? "").trim(); }
function positive(v) { const n = Number(String(v ?? "").replace(/,/g, ".")); return Number.isFinite(n) ? Math.max(0,n) : 0; }
function unit(v) { return text(v).toUpperCase() || "QTY"; }
function normalizeKey(v) { return text(v).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function mappingKey(name, variant) { return `${normalizeKey(name)}|${normalizeKey(variant)}`; }
function salesKey(date, name, variant) { return hashId(`${date}|${mappingKey(name,variant)}`); }
function hashId(value) {
  let h = 2166136261;
  for (const ch of String(value || "")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return `s${(h >>> 0).toString(36)}`;
}
function normalizeDate(value) {
  const raw = text(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})[-\/]?(\d{1,2})[-\/]?(\d{1,2})$/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2,"0")}-${String(iso[3]).padStart(2,"0")}`;
  const id = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (id) return `${id[3]}-${String(id[2]).padStart(2,"0")}-${String(id[1]).padStart(2,"0")}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  return "";
}
