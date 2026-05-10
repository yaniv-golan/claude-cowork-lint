// Synthetic fixture exercising the AMBIGUOUS sentinel: H9 is bound twice
// at the top level (one assigns "X", the other "Y"). resolveStringSet on an
// Identifier reference to H9 must return [] rather than picking either value.

(function () {
  var H9 = "X";
  return H9;
})();

(function () {
  var H9 = "Y";
  return H9;
})();

// Add a third binding to ensure triple+ stays AMBIGUOUS too.
var H9 = "Z";
