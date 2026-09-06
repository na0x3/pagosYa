// The café owns its presentation. Commerce lives in the portable commerce.js file.
document.addEventListener("pagosya:ready", (event) => {
  document.querySelectorAll(".demo-label").forEach((label) => { label.hidden = !event.detail.demo && !event.detail.preview; });
});
