/** Polyfills required by pdfjs-dist v5+/v6 on older Chromium builds. */
export function ensurePdfJsPolyfills() {
  const proto = Map.prototype as Map<unknown, unknown> & {
    getOrInsert?: (key: unknown, defaultValue: unknown) => unknown;
    getOrInsertComputed?: (
      key: unknown,
      callbackFn: (key: unknown) => unknown,
    ) => unknown;
  };

  if (typeof proto.getOrInsert !== 'function') {
    proto.getOrInsert = function getOrInsert(key, defaultValue) {
      if (this.has(key)) return this.get(key);
      this.set(key, defaultValue);
      return defaultValue;
    };
  }

  if (typeof proto.getOrInsertComputed !== 'function') {
    proto.getOrInsertComputed = function getOrInsertComputed(key, callbackFn) {
      if (this.has(key)) return this.get(key);
      const value = callbackFn(key);
      this.set(key, value);
      return value;
    };
  }
}
