'use strict';
export default function fuzzyUrlEquals(one, other) {
  one = fullyDecodeURI(one);
  other = fullyDecodeURI(other);
  return fuzzyIncludes(one, other) || fuzzyIncludes(other, one);
}

function isEncoded(uri) {
  uri = uri || '';
  return uri !== decodeURIComponent(uri);
}

function fullyDecodeURI(uri) {
  while (isEncoded(uri)) {
    uri = decodeURIComponent(uri);
  }

  return uri;
}

function fuzzyIncludes(one, other) {
  return (
    one.indexOf(other) !== -1 ||
    (other.charAt(other.length - 1) === '/' &&
      one.indexOf(other.slice(0, -1)) !== -1)
  );
}
