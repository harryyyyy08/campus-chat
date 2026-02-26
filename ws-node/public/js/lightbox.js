// ════════════════════════════════════════════
// LIGHTBOX (image viewer)
// ════════════════════════════════════════════

function ensureLightbox() {
  let lb = document.getElementById("lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "lightbox";
    lb.innerHTML = `
                  <div id="lightboxBackdrop"></div>
                  <div id="lightboxContent">
                    <button id="lightboxClose" onclick="closeLightbox()">✕</button>
                    <div id="lightboxSpinner"><div class="img-spinner"></div></div>
                    <img id="lightboxImg" src="" alt="" style="display:none;" />
                    <div id="lightboxName"></div>
                  </div>`;
    document.body.appendChild(lb);
    document.getElementById("lightboxBackdrop").onclick = closeLightbox;
  }
  return lb;
}

// Open lightbox using ?token= URL directly
function openLightboxBlob(url, name) {
  const lb = ensureLightbox();
  const img = document.getElementById("lightboxImg");
  const spinner = document.getElementById("lightboxSpinner");
  document.getElementById("lightboxName").textContent = name;

  img.style.display = "none";
  spinner.style.display = "flex";
  lb.classList.add("open");
  document.body.style.overflow = "hidden";

  img.onload = () => {
    img.style.display = "block";
    spinner.style.display = "none";
  };
  img.onerror = () => {
    spinner.style.display = "none";
    img.style.display = "none";
  };
  img.src = protectedImgUrl(url);
}

function closeLightbox() {
  const lb = document.getElementById("lightbox");
  if (lb) lb.classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});