import { main } from "./app"
import * as audio from "./audio"
import * as math from "./math"

// Globals for canvas rendering
const canvas = document.querySelector("canvas")
const ctx = canvas.getContext("2d")
let width = window.innerWidth
let height = window.innerHeight

// A variable to store the most recent mouse position (for testing)
const mouse = { x: 0, y: 0 }

async function init() {
  // Remove the interaction prompt
  document.querySelector("h1").remove()

  // Attempt to grab the wake lock
  try {
    const wakeLock = await navigator.wakeLock.request("screen")
  } catch (err) {
    // alert(`${err.name}, ${err.message}`)
  }

  // Run the audio
  const audioAPI = main()

  function tick(ms: number) {
    // Update the audio every frame
    audioAPI.tick(ms)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawSpectrum()
    // drawMouse()

    // ctx.fillStyle = "#fff"
    // ctx.fillText(`Chord: ${audioAPI.state.chord}`, window.innerWidth / 2, 20)

    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function drawSpectrum() {
  const nBins = audio.analyser.frequencyBinCount
  const binData = new Uint8Array(nBins)
  audio.analyser.getByteFrequencyData(binData)

  ctx.fillStyle = "#fff"
  for (let i = 0; i < nBins; i++) {
    let frac = i / nBins
    frac **= 0.25 // This biases the spectrum so that low frequencies are wider, which more closely matches how we perceive pitch
    const x = frac * window.innerWidth
    const y = (1 - binData[i] / 256) * window.innerHeight
    let scale = (1 - frac) ** 4 + 0.2
    ctx.fillRect(x - 2 * scale, y - 4 * scale, 4 * scale, 8 * scale)
  }
}

function drawMouse() {
  ctx.beginPath()
  ctx.fillStyle = "#fff"
  ctx.arc(mouse.x, mouse.y, 10, 0, math.TAU)
  ctx.fill()
}

// Resize the canvas, set a nice scale factor, and set sensible defaults (which get cleared on resize)
function resize() {
  const dpi = window.devicePixelRatio
  width = window.innerWidth
  height = window.innerHeight
  canvas.width = dpi * width
  canvas.height = dpi * height
  ctx.resetTransform()
  ctx.scale(dpi, dpi)
  ctx.font = "12px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

window.addEventListener("resize", resize)
resize()

// Track the mouse position
window.addEventListener("pointermove", (e) => {
  mouse.x = e.clientX
  mouse.y = e.clientY
})

// When the user clicks, initialize the audio and begin running
window.addEventListener("pointerup", init, { once: true })
