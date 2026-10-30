// Modo claro u oscuro. Se aplica antes de pintar la página y recuerda la elección solo en este navegador.
const raiz = document.documentElement;
try {
  if (localStorage.getItem("modo") === "claro") raiz.dataset.modo = "claro";
} catch {}

addEventListener("DOMContentLoaded", () => {
  const boton = document.getElementById("cambiar-modo");
  if (!boton) return;
  const rotular = () => (boton.textContent = raiz.dataset.modo === "claro" ? "Modo oscuro" : "Modo claro");
  boton.hidden = false;
  rotular();
  boton.addEventListener("click", () => {
    if (raiz.dataset.modo === "claro") delete raiz.dataset.modo;
    else raiz.dataset.modo = "claro";
    rotular();
    try {
      if (raiz.dataset.modo) localStorage.setItem("modo", "claro");
      else localStorage.removeItem("modo");
    } catch {}
  });
});
