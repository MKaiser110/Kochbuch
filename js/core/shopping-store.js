const STORAGE_KEY = 'kochbuch-shopping-v1';
const CATALOG_STORAGE_KEY = 'kochbuch-products-v1';

const defaultProducts = [
  ['Obst & Gemüse','Apfel','🍎'],['Obst & Gemüse','Banane','🍌'],['Obst & Gemüse','Zitrone','🍋'],['Obst & Gemüse','Tomate','🍅'],['Obst & Gemüse','Kartoffel','🥔'],['Obst & Gemüse','Zwiebel','🧅'],['Obst & Gemüse','Knoblauch','🧄'],['Obst & Gemüse','Karotte','🥕'],['Obst & Gemüse','Paprika','🫑'],['Obst & Gemüse','Gurke','🥒'],['Obst & Gemüse','Brokkoli','🥦'],['Obst & Gemüse','Salat','🥬'],['Obst & Gemüse','Champignons','🍄'],['Obst & Gemüse','Avocado','🥑'],
  ['Milchprodukte & Eier','Milch','🥛'],['Milchprodukte & Eier','Butter','🧈'],['Milchprodukte & Eier','Käse','🧀'],['Milchprodukte & Eier','Joghurt','🥣'],['Milchprodukte & Eier','Sahne','🥛'],['Milchprodukte & Eier','Eier','🥚'],['Milchprodukte & Eier','Quark','🥣'],
  ['Brot & Backwaren','Brot','🍞'],['Brot & Backwaren','Brötchen','🥐'],['Brot & Backwaren','Mehl','🌾'],['Brot & Backwaren','Toast','🍞'],
  ['Fleisch & Fisch','Hähnchen','🍗'],['Fleisch & Fisch','Hackfleisch','🥩'],['Fleisch & Fisch','Lachs','🐟'],['Fleisch & Fisch','Wurst','🥓'],
  ['Vorrat & Gewürze','Nudeln','🍝'],['Vorrat & Gewürze','Reis','🍚'],['Vorrat & Gewürze','Haferflocken','🌾'],['Vorrat & Gewürze','Tomaten (Dose)','🥫'],['Vorrat & Gewürze','Olivenöl','🫒'],['Vorrat & Gewürze','Salz','🧂'],['Vorrat & Gewürze','Zucker','🍬'],['Vorrat & Gewürze','Kaffee','☕'],
  ['Getränke','Wasser','💧'],['Getränke','Saft','🧃'],
].map(([category, name, icon]) => ({ id: crypto.randomUUID(), category, name, icon }));

function readStoredArray(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export let products = readStoredArray(CATALOG_STORAGE_KEY, defaultProducts);
export const items = readStoredArray(STORAGE_KEY, []);

export function removeShoppingProduct(id) {
  products = products.filter(product => product.id !== id);
}

export function saveShoppingState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(products));
}

export function normalizeShoppingName(value) {
  return String(value || '').trim().toLocaleLowerCase('de');
}
