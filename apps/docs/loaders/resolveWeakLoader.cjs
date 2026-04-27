const resolveWeakCallPattern = /require\.resolveWeak\([^)]*\)/g;

module.exports = function resolveWeakLoader(source) {
  return source.replace(resolveWeakCallPattern, "undefined");
};
