(function () {
  // Edit these two lines to change the footer on every page that uses it
  var COMPANY = 'Ejisco International Limited';
  var POWERED_BY = 'Diogba Oghenevovweroh';   // for example 'Ejisco IT'. Leave empty to hide this part.

  var parts = ['\u00A9 ' + COMPANY, 'All rights reserved'];
  if (POWERED_BY) parts.push('Powered by ' + POWERED_BY);

  var footer = document.createElement('footer');
  footer.className = 'auth-footer';
  footer.textContent = parts.join(' | ');
  document.body.appendChild(footer);
})();