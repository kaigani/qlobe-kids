// Google Analytics (GA4). One ID here — every page loads this file instead of
// pasting the gtag snippet 100+ times across games/*/index.html.
(function () {
  var GA_ID = 'G-H2WT0GRBVS';
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
})();
