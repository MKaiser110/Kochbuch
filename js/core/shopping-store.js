import { extendedProductCatalog } from './extended-product-catalog.js';

const STORAGE_KEY = 'kochbuch-shopping-v1';
const CATALOG_STORAGE_KEY = 'kochbuch-products-v1';
const CATALOG_CATEGORY_KEY = 'kochbuch-product-categories-v1';
const CATALOG_COLLAPSED_KEY = 'kochbuch-product-categories-collapsed-v1';
const CATALOG_REPLACEMENT_MIGRATION_KEY = 'kochbuch-products-replaced-v2';

function readStoredArray(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export let products = [];

const replacementCatalog = extendedProductCatalog.map(([category, name, icon]) => ({
  id: crypto.randomUUID(),
  category,
  name,
  icon,
}));
export const items = readStoredArray(STORAGE_KEY, []);

export const defaultCatalogCategories = [
  'OBST & gemüse',
  'Brot & Gebäck',
  'Milch & Käse',
  'Fleisch & Fisch',
  'Zutaten & Gewürze',
  'Fertig- & Tiefkühlprodukte',
  'getreideprodukte',
  'snacks & süsswaren',
  'getränke',
  'Haushalt',
  'pflege & gesundheit',
  'baumarkt & garten',
  'Sonstiges',
];

export let catalogCategories = readStoredArray(CATALOG_CATEGORY_KEY, defaultCatalogCategories);

if (!localStorage.getItem(CATALOG_REPLACEMENT_MIGRATION_KEY)) {
  products = replacementCatalog;
  catalogCategories = [...defaultCatalogCategories];
  for (const item of items) {
    const replacement = products.find(product =>
      String(product.name || '').trim().toLocaleLowerCase('de') ===
      String(item.name || '').trim().toLocaleLowerCase('de'));
    if (replacement) {
      item.productId = replacement.id;
      item.name = replacement.name;
      item.category = replacement.category;
      item.icon = replacement.icon;
    }
  }
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(products));
  localStorage.setItem(CATALOG_CATEGORY_KEY, JSON.stringify(catalogCategories));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(CATALOG_REPLACEMENT_MIGRATION_KEY, '1');
} else {
  products = readStoredArray(CATALOG_STORAGE_KEY, replacementCatalog);
  catalogCategories = readStoredArray(CATALOG_CATEGORY_KEY, defaultCatalogCategories);
}
catalogCategories = [
  ...catalogCategories,
  ...[...new Set(products.map(product => product.category || 'Sonstiges'))]
    .filter(category => !catalogCategories.includes(category)),
].filter((category, index, all) => all.indexOf(category) === index);
if (!catalogCategories.length) catalogCategories = ['Sonstiges'];

export let collapsedCatalogCategories = readStoredArray(CATALOG_COLLAPSED_KEY, []);
collapsedCatalogCategories = collapsedCatalogCategories.filter(category =>
  typeof category === 'string');

export function removeShoppingProduct(id) {
  products = products.filter(product => product.id !== id);
}

export function saveShoppingState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(products));
  localStorage.setItem(CATALOG_CATEGORY_KEY, JSON.stringify(catalogCategories));
  localStorage.setItem(CATALOG_COLLAPSED_KEY, JSON.stringify(collapsedCatalogCategories));
}

export function normalizeShoppingName(value) {
  return String(value || '').trim().toLocaleLowerCase('de');
}
