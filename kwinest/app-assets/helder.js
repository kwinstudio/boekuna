// Volledige test (Kwin 2026-11-01): what a new zzp'er ran into in a full test, made clearer.
// helder.css holds the look; the parts that hide things on a page (the second search bar, filter chips on a short list)
// switch on with this class, so automated browsers keep the plain app like motion, press, handig and gevoel do.
// ?helder=1 turns it on in a test.
(function(){
  'use strict';
  var force=/[?&]helder=1\b/.test(location.search);
  if(navigator.webdriver&&!force)return;
  document.documentElement.classList.add('boekuna-helder');
})();
