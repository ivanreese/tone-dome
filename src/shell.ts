import { main } from "./app"

function init() {
  // Remove the interaction prompt
  document.querySelector("h1").remove()
  main()
}

// When the user clicks, initialize the audio and begin running
window.addEventListener("pointerup", init, { once: true })
