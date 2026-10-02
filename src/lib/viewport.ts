export const stableHeightVar = '--vh-stable';

// Runs in <head> before the first paint. Phone browsers that resize the page
// while their toolbar slides (Chrome on iOS) also change svh, so the phone
// layout reads this height instead. It is measured again only when the width
// changes, for example on rotation.
export const stableHeightScript = `(function () {
  var root = document.documentElement;
  var width = -1;
  function measure() {
    if (root.clientWidth === width) return;
    width = root.clientWidth;
    root.style.setProperty(${JSON.stringify(stableHeightVar)}, root.clientHeight + 'px');
  }
  measure();
  window.addEventListener('resize', measure);
})();`;
