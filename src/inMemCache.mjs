export function memoizePromiseFn(fn) {
  const cache = new Map();

  return (...args) => {
    const key = args[0];
    if (cache.has(key)) {
      return cache.get(key);
    }

    cache.set(key, fn(...args).catch((error) => {
      // Delete cache entry if API call fails
      cache.delete(key);
      return Promise.reject(error);
    }));

    return cache.get(key);
  };
}
