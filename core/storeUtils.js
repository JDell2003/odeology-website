const replaceSearchTermInUrl = (url, term) => {
  try {
    const u = new URL(url);
    const keys = ['q', 'query', 'search', 'searchTerm', 'keyword', 'term'];
    let replaced = false;
    keys.forEach((k) => {
      if (u.searchParams.has(k)) {
        u.searchParams.set(k, term);
        replaced = true;
      }
    });
    return replaced ? u.toString() : url;
  } catch {
    return url;
  }
};

const replaceSearchTermInBody = (postData, term) => {
  if (!postData) return postData;
  try {
    const parsed = JSON.parse(postData);
    const keys = ['q', 'query', 'search', 'searchTerm', 'keyword', 'term'];
    const replaceDeep = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach((key) => {
        if (keys.includes(key)) {
          obj[key] = term;
        } else if (typeof obj[key] === 'object') {
          replaceDeep(obj[key]);
        }
      });
    };
    replaceDeep(parsed);
    return JSON.stringify(parsed);
  } catch {
    return postData;
  }
};

const findFirstProductLike = (payload) => {
  const stack = [payload];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      node.forEach((item) => stack.push(item));
      continue;
    }
    const name = node.name || node.title || node.productName;
    const price = node.price || node.currentPrice || node.priceValue || node.salePrice;
    const url = node.url || node.productUrl || node.canonicalUrl;
    if (name && price) {
      return { name, price, url: url || null };
    }
    Object.values(node).forEach((val) => {
      if (typeof val === 'object') stack.push(val);
    });
  }
  return null;
};

module.exports = {
  replaceSearchTermInUrl,
  replaceSearchTermInBody,
  findFirstProductLike
};
