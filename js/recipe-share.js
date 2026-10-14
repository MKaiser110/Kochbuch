function bytesToBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function decodeLegacyPayload(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function encodeSharedRecipe(recipe) {
  const bytes = new TextEncoder().encode(JSON.stringify({
    type: 'kochbuch-recipe',
    recipe,
  }));

  if (typeof CompressionStream === 'function' && typeof DecompressionStream === 'function') {
    const compressed = await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
    ).arrayBuffer();
    return `gzip.${bytesToBase64Url(new Uint8Array(compressed))}`;
  }
  return `plain.${bytesToBase64Url(bytes)}`;
}

export async function decodeSharedRecipe(value) {
  try {
    let payload;
    if (value.startsWith('gzip.')) {
      if (typeof DecompressionStream !== 'function') return null;
      const bytes = base64UrlToBytes(value.slice('gzip.'.length));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      payload = JSON.parse(await new Response(stream).text());
    } else if (value.startsWith('plain.')) {
      const bytes = base64UrlToBytes(value.slice('plain.'.length));
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } else {
      payload = decodeLegacyPayload(value);
    }

    const recipe = payload?.type === 'kochbuch-recipe' ? payload.recipe : null;
    if (!recipe?.title || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) {
      return null;
    }
    return recipe;
  } catch {
    return null;
  }
}
