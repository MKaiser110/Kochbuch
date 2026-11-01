import {
  items,
  normalizeShoppingName,
  products,
  removeShoppingProduct,
  saveShoppingState,
} from '../core/shopping-store.js';

const esc=s=>{const d=document.createElement('span');d.textContent=s;return d.innerHTML;};
const iconOf=p=>p.icon ? (p.icon.startsWith('data:')||p.icon.startsWith('http')?'<img src="'+esc(p.icon)+'" alt="">':esc(p.icon)) : '<span>'+esc((p.name||'?').trim().charAt(0).toUpperCase())+'</span>';
let pendingItemId=null;
let shoppingCleanup=null;

function activateShoppingStyles() {
  document.body.classList.add('shopping-styles-ready');
}

function tile(p,click,quantity='',onLongPress=null){const b=document.createElement('button');b.type='button';b.className='product-tile';b.innerHTML='<span class="product-icon">'+iconOf(p)+'</span><span class="product-name">'+esc(p.name)+'</span>'+(quantity?'<span class="product-quantity">'+esc(quantity)+'</span>':'');let timer=null,held=false;const trigger=()=>{if(held||!onLongPress)return;held=true;onLongPress();setTimeout(()=>{held=false;},700);};b.addEventListener('pointerdown',()=>{if(onLongPress)timer=setTimeout(trigger,550);});const cancel=()=>{clearTimeout(timer);};b.addEventListener('pointerup',cancel);b.addEventListener('pointerleave',cancel);b.addEventListener('pointercancel',cancel);b.addEventListener('contextmenu',event=>{if(onLongPress){event.preventDefault();trigger();}});b.addEventListener('click',event=>{if(held){event.preventDefault();event.stopImmediatePropagation();held=false;return;}click();});return b;}
export function renderShopping(){activateShoppingStyles();if(shoppingCleanup)shoppingCleanup();document.body.classList.add('shopping-active');document.querySelector('.topbar h1').textContent='Kochbuch';const root=document.getElementById('app');root.innerHTML='<div class="shopping-page"><div id="shopping-items"></div><div class="shopping-search-wrap"><div id="shopping-suggestions" class="shopping-suggestions"></div><input id="shopping-search" type="search" placeholder="Produkt suchen oder hinzufügen…" autocomplete="off"></div></div>';const search=root.querySelector('#shopping-search');search.value=sessionStorage.getItem('shopping-query')||'';const searchWrap=root.querySelector('.shopping-search-wrap');document.body.append(searchWrap);search.addEventListener('input',()=>{sessionStorage.setItem('shopping-query',search.value);render();});const onRouteChange=()=>{if(location.hash!=='#shopping'&&shoppingCleanup){const cleanup=shoppingCleanup;shoppingCleanup=null;cleanup();}};window.addEventListener('hashchange',onRouteChange);shoppingCleanup=()=>{window.removeEventListener('hashchange',onRouteChange);searchWrap.remove();};function render(){const wrap=root.querySelector('#shopping-items');wrap.replaceChildren();const active=items.filter(x=>!x.done);root.querySelector('.shopping-page').classList.toggle('has-items',active.length>0);if(!active.length){const e=document.createElement('p');e.className='shopping-empty';e.textContent='Deine Einkaufsliste ist noch leer. Suche unten nach Produkten.';wrap.append(e);}const cats=[...new Set(active.map(x=>x.category||'Sonstiges'))];for(const cat of cats){const section=document.createElement('section');section.className='shopping-section';section.innerHTML='<h2>'+esc(cat)+'</h2>';const grid=document.createElement('div');grid.className='shopping-grid';active.filter(x=>(x.category||'Sonstiges')===cat).forEach(x=>{const p=products.find(y=>y.id===x.productId)||x;const card=document.createElement('div');card.className='shopping-item-wrap';card.append(tile({...p,name:p.name||x.name},()=>{x.done=true;saveShoppingState();render();},x.quantity||'',()=>showItemDetails(x)));const edit=document.createElement('button');edit.type='button';edit.className='shopping-item-edit';edit.setAttribute('aria-label','Menge oder Details bearbeiten');edit.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4.8L8 20l11-11a2.1 2.1 0 0 0-3-3L5 17"></path><path d="m14.5 7.5 3 3"></path></svg>';edit.addEventListener('click',()=>editItemDetails(x));card.append(edit);grid.append(card);});section.append(grid);wrap.append(section);}const q=search.value.trim(), suggestions=searchWrap.querySelector('#shopping-suggestions');suggestions.replaceChildren();if(q){pendingItemId=null;const matches=products.filter(p=>normalizeShoppingName(p.name).includes(normalizeShoppingName(q))).slice(0,8);const exact={id:'typed-'+q,name:q,category:'Sonstiges',icon:''};suggestions.append(tile(exact,()=>addProduct(exact,'',true)));matches.filter(p=>p.name!==q).forEach(p=>suggestions.append(tile(p,()=>addProduct(p,''))));}else if(pendingItemId){const item=items.find(x=>x.id===pendingItemId);if(item){['1','2','3','500 g','1 kg','1 l'].forEach(value=>{const b=document.createElement('button');b.type='button';b.className='quantity-suggestion';b.textContent=value;b.onclick=()=>{item.quantity=value;pendingItemId=null;saveShoppingState();render();};suggestions.append(b);});const details=document.createElement('button');details.type='button';details.className='quantity-suggestion details';details.textContent='Eigene Details hinzufügen';details.onclick=()=>editItemDetails(item);suggestions.append(details);}}}render();}
function addProduct(p,quantity='',customName=false){let product=customName?products.find(x=>x.name===p.name):products.find(x=>x.id===p.id);if(!product){product={...p,id:crypto.randomUUID(),category:p.category||'Sonstiges'};products.push(product);}let item=items.find(x=>x.productId===product.id&&!x.done);if(item){if(quantity)item.quantity=item.quantity?item.quantity+', '+quantity:quantity;}else{item={id:crypto.randomUUID(),productId:product.id,name:product.name,category:product.category,icon:product.icon||'',quantity,details:'',done:false};items.push(item);}pendingItemId=item.id;saveShoppingState();const input=document.getElementById('shopping-search');if(input){input.value='';sessionStorage.removeItem('shopping-query');input.dispatchEvent(new Event('input'));input.focus();}}
export function focusShopping(){if(location.hash!=='#shopping')location.hash='shopping';setTimeout(()=>document.getElementById('shopping-search')?.focus(),80);}
export function openProductCatalog(){activateShoppingStyles();const d=document.createElement('dialog');d.className='shopping-dialog catalog-dialog';d.innerHTML='<h2>Produktkatalog</h2><p>Produkte verwalten, hinzufügen oder als Datei sichern.</p><div class="shopping-catalog-list"></div><div class="shopping-dialog-actions"><button class="primary" data-add>+ Produkt</button><button data-export>Exportieren</button><button data-import>Importieren</button><button data-close>Schließen</button></div><input type="file" accept="application/json,.json" hidden>';const list=d.querySelector('.shopping-catalog-list');function fill(){list.replaceChildren();const categories=[...new Set(products.map(p=>p.category||'Sonstiges'))].sort((a,b)=>a.localeCompare(b,'de'));for(const category of categories){const section=document.createElement('section');section.className='catalog-section';const heading=document.createElement('h3');heading.textContent=category;const grid=document.createElement('div');grid.className='catalog-grid';products.filter(p=>(p.category||'Sonstiges')===category).sort((a,b)=>a.name.localeCompare(b.name,'de')).forEach(p=>{const row=document.createElement('div');row.className='shopping-catalog-row';row.innerHTML='<span class="catalog-icon">'+iconOf(p)+'</span><span class="catalog-product-name" title="'+esc(p.name)+'">'+esc(p.name)+'</span><span class="catalog-actions"><button type="button" aria-label="Bearbeiten '+esc(p.name)+'" class="catalog-edit">Bearbeiten</button><button type="button" aria-label="Entfernen '+esc(p.name)+'" class="catalog-remove">×</button></span>';row.querySelector('.catalog-edit').onclick=()=>{d.close();openProductForm(p);};row.querySelector('.catalog-remove').onclick=()=>{removeShoppingProduct(p.id);saveShoppingState();fill();};grid.append(row);});section.append(heading,grid);list.append(section);}}fill();d.querySelector('[data-close]').onclick=()=>d.close();d.querySelector('[data-add]').onclick=()=>{d.close();openProductForm();};d.querySelector('[data-export]').onclick=()=>downloadJSON({version:1,products},'produktkatalog.json');const file=d.querySelector('input[type=file]');d.querySelector('[data-import]').onclick=()=>file.click();file.onchange=async()=>{try{const data=JSON.parse(await file.files[0].text());if(!Array.isArray(data.products))throw Error();for(const p of data.products){if(p.name&&!products.some(x=>normalizeShoppingName(x.name)===normalizeShoppingName(p.name)))products.push({id:crypto.randomUUID(),name:String(p.name),category:String(p.category||'Sonstiges'),icon:String(p.icon||'')});}saveShoppingState();fill();}catch{alert('Die Katalogdatei ist ungültig.');}};document.body.append(d);d.showModal();d.addEventListener('close',()=>d.remove(),{once:true});}
function openProductForm(existing=null){const d=document.createElement('dialog');d.className='shopping-dialog';d.innerHTML='<h2>'+(existing?'Produkt bearbeiten':'Produkt hinzufügen')+'</h2><label>Produktname<input name="name" required></label><label>Kategorie<select name="category">'+['Obst & Gemüse','Milchprodukte & Eier','Brot & Backwaren','Fleisch & Fisch','Vorrat & Gewürze','Getränke','Sonstiges'].map(x=>'<option>'+x+'</option>').join('')+'</select></label><label>Icon (Emoji, optional)<input name="icon" placeholder="z. B. 🥭"></label><label>Eigenes Bild (optional)<input name="image" type="file" accept="image/*"></label><div class="shopping-dialog-actions"><button data-cancel>Abbrechen</button><button class="primary" data-save>Speichern</button></div>';const name=d.querySelector('[name=name]'),category=d.querySelector('[name=category]'),iconInput=d.querySelector('[name=icon]');if(existing){name.value=existing.name;category.value=existing.category||'Sonstiges';iconInput.value=existing.icon?.startsWith('data:')?'':existing.icon||'';}d.querySelector('[data-cancel]').onclick=()=>d.close();d.querySelector('[data-save]').onclick=async()=>{const productName=name.value.trim();if(!productName){name.focus();return;}let icon=iconInput.value.trim()||existing?.icon||'';const file=d.querySelector('[name=image]').files[0];if(file)icon=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file);});if(existing){existing.name=productName;existing.category=category.value;existing.icon=icon;items.filter(x=>x.productId===existing.id).forEach(x=>{x.name=productName;x.category=category.value;x.icon=icon;});}else products.push({id:crypto.randomUUID(),name:productName,category:category.value,icon});saveShoppingState();d.close();openProductCatalog();};document.body.append(d);d.showModal();d.addEventListener('close',()=>d.remove(),{once:true});}
function downloadJSON(data,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
function showItemDetails(item){const d=document.createElement('dialog');d.className='shopping-dialog';d.innerHTML='<h2>'+esc(item.name)+'</h2><p><strong>Menge:</strong> '+esc(item.quantity||'Keine Menge angegeben')+'</p><p><strong>Details:</strong> '+esc(item.details||'Keine weiteren Details')+'</p><div class="shopping-dialog-actions"><button data-close>Schließen</button><button class="primary" data-edit>Bearbeiten</button></div>';d.querySelector('[data-close]').onclick=()=>d.close();d.querySelector('[data-edit]').onclick=()=>{d.close();editItemDetails(item);};document.body.append(d);d.showModal();d.addEventListener('close',()=>d.remove(),{once:true});}
function editItemDetails(item){activateShoppingStyles();const d=document.createElement('dialog');d.className='shopping-dialog';d.innerHTML='<h2>'+esc(item.name)+'</h2><label>Menge<input name="quantity" value="'+esc(item.quantity||'')+'" placeholder="z. B. 2 Stück oder 500 g"></label><label>Eigene Details<textarea name="details" rows="3" placeholder="Marke, Sorte oder weitere Notizen">'+esc(item.details||'')+'</textarea></label><div class="shopping-dialog-actions"><button data-cancel>Abbrechen</button><button class="primary" data-save>Speichern</button></div>';d.querySelector('[data-cancel]').onclick=()=>d.close();d.querySelector('[data-save]').onclick=()=>{item.quantity=d.querySelector('[name=quantity]').value.trim();item.details=d.querySelector('[name=details]').value.trim();pendingItemId=null;saveShoppingState();d.close();document.getElementById('shopping-search')?.dispatchEvent(new Event('input'));};document.body.append(d);d.showModal();d.addEventListener('close',()=>d.remove(),{once:true});}
export function chooseRecipeIngredients(ingredients) {
  activateShoppingStyles();
  const recipeIngredients = ingredients || [];
  const d = document.createElement('dialog');
  d.className = 'shopping-dialog ingredient-choice-dialog';
  d.innerHTML = '<header class="ingredient-choice-header"><h2>Zutaten übernehmen</h2><p>Wähle aus, was du einkaufen möchtest. Alle Zutaten sind vorausgewählt.</p><span class="ingredient-choice-count" aria-live="polite"></span></header><div class="ingredient-choice-grid shopping-grid" role="group" aria-label="Rezeptzutaten"></div><div class="shopping-dialog-actions"><button data-cancel>Abbrechen</button><button class="primary" data-add>Auswahl hinzufügen</button></div>';

  const choices = d.querySelector('.ingredient-choice-grid');
  const count = d.querySelector('.ingredient-choice-count');
  const addButton = d.querySelector('[data-add]');
  const validIngredients = recipeIngredients
    .map((ingredient, index) => ({ ingredient, index }))
    .filter(({ ingredient }) => ingredient.name?.trim());

  const updateSelection = () => {
    const selected = choices.querySelectorAll('.ingredient-choice-tile.selected').length;
    count.textContent = `${selected} von ${validIngredients.length} Zutaten ausgewählt`;
    addButton.disabled = selected === 0;
  };

  validIngredients.forEach(({ ingredient, index }) => {
    const product = {
      name: ingredient.name,
      icon: products.find(product => normalizeShoppingName(product.name) === normalizeShoppingName(ingredient.name))?.icon || '',
    };
    const button = tile(product, () => {
      button.classList.toggle('selected');
      button.setAttribute('aria-pressed', String(button.classList.contains('selected')));
      updateSelection();
    }, [ingredient.amount, ingredient.unit].filter(Boolean).join(' '));
    button.classList.add('ingredient-choice-tile', 'selected');
    button.setAttribute('aria-pressed', 'true');
    button.dataset.index = String(index);
    const indicator = document.createElement('span');
    indicator.className = 'ingredient-choice-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6"></path></svg>';
    button.append(indicator);
    choices.append(button);
  });

  if (!validIngredients.length) {
    const empty = document.createElement('p');
    empty.className = 'ingredient-choice-empty';
    empty.textContent = 'Dieses Rezept enthält keine Zutaten, die übernommen werden können.';
    choices.append(empty);
  }

  updateSelection();
  d.querySelector('[data-cancel]').onclick = () => d.close();
  addButton.onclick = () => {
    choices.querySelectorAll('.ingredient-choice-tile.selected').forEach(button => {
      const ingredient = recipeIngredients[Number(button.dataset.index)];
      const product = {
        id: 'new-' + normalizeShoppingName(ingredient.name),
        name: ingredient.name.trim(),
        category: 'Sonstiges',
        icon: products.find(item => normalizeShoppingName(item.name) === normalizeShoppingName(ingredient.name))?.icon || '',
      };
      addProduct(product, [ingredient.amount, ingredient.unit].filter(Boolean).join(' '), true);
    });
    d.close();
    alert('Ausgewählte Zutaten wurden zur Einkaufsliste hinzugefügt.');
  };
  document.body.append(d);
  d.showModal();
  d.addEventListener('close', () => d.remove(), { once: true });
}
