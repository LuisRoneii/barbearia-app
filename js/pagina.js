/* ==========================================================================
   ZT BARBER — pagina.js
   Páginas só de texto (ex.: privacidade.html): menu do celular e ano do rodapé.
   ========================================================================== */

(() => {
  "use strict";

  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobile-nav");
  hamburger.addEventListener("click", () => {
    const aberto = mobileNav.classList.toggle("is-open");
    hamburger.setAttribute("aria-expanded", String(aberto));
  });
  document.getElementById("ano").textContent = new Date().getFullYear();
})();
