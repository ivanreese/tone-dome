import * as audio from "./audio"
import * as math from "./math"

// Globals for canvas rendering
const canvas = document.querySelector("canvas")
const ctx = canvas.getContext("2d")
let width = window.innerWidth
let height = window.innerHeight

// Coefficients for generating the waveshape for the oscillator
const waveCoefficients = 4
const real = new Float32Array(waveCoefficients)
const imag = new Float32Array(waveCoefficients)

// These are useful for tuning (to get really nice thirds, etc)
const pythagoreanRatios = [1, 256 / 243, 9 / 8, 32 / 27, 81 / 64, 4 / 3, 1024 / 729, 3 / 2, 128 / 81, 27 / 16, 16 / 9, 243 / 128]

const major7th = [1, 81 / 64, 3 / 2, 16 / 9]

// A variable to store the most recent mouse position (for testing)
const mouse = { x: 0, y: 0 }

async function main() {
  // Remove the interaction prompt
  document.querySelector("h1").remove()

  // Set up the audio context (MUST be done in response to user input)
  audio.setupAudio()

  // Make some oscillators
  const oscs = makeOscs(10)

  // Create some sliders for testing waveCoefficients
  // We skip the first coefficient because it's just DC offset
  // makeSliders(waveCoefficients - 1, (i, v) => (real[i + 1] = v))

  real[1] = 1

  function tick(ms) {
    requestAnimationFrame(tick)

    let t = ms / 1000

    // Modulate the coeficients to create interesting ambience
    for (let i = 0; i < waveCoefficients; i++) {
      const frac = i / waveCoefficients

      // let innerCycle = Math.sin(frac * t)
      // let outerCycle = Math.sin(frac * innerCycle)
      // imag[i] = (1 - frac) * outerCycle

      // let c = Math.cos(t)
      // let p = Math.pow(c, Math.round((2 * t) % 3))
      // const beat = Math.sin(p * math.TAU)
      // imag[i] *= beat
      // real[i] *= beat

      // let c = Math.cos(frac * t)
      // let p = Math.pow(c, Math.round((2 * t) % 3))
      // real[i] = Math.sin(p * math.TAU)

      // let innerCycle = Math.asin(Math.cos(frac * t))
      // let outerCycle = Math.acos(Math.sin(frac * innerCycle))
      // real[i] = (1 - frac) * outerCycle
      // real[i] = isFinite(real[i]) ? real[i] : 0
    }

    // Create a new PeriodicWave every frame, using the current real / imag coefficients
    const wave = audio.context.createPeriodicWave(real, imag, { disableNormalization: true })

    // Update all oscillators to use this new PeriodicWave
    oscs.forEach((osc) => osc.setPeriodicWave(wave))

    // Make the oscillators a bit silly
    // oscs.forEach((osc) => (osc.detune.value = 1000 * Math.tan(t / 100)))

    // oscs.forEach((osc) => (osc.detune.value = mouse.x))

    // Calculate transposition so that we sort of smoothstep through the ratios
    const transTime = 20
    const transFrac = t / transTime
    const lowT = math.arrMod(pythagoreanRatios, Math.floor(transFrac))
    const hiT = lowT == 11 ? 12 : math.arrMod(pythagoreanRatios, Math.ceil(transFrac))
    const curvedT = math.denormalized(transFrac % 1, -1, 1) ** 7
    const trans = math.renormalized(curvedT, -1, 1, lowT, hiT)

    // Tune the oscillators
    oscs.forEach((osc, i) => {
      let y = 1 //math.normalized(mouse.y, 0, window.innerHeight)
      let x = 0.3 // math.normalized(mouse.x, 0, window.innerWidth)

      const octave = Math.floor(i / major7th.length)
      const ratio = math.arrMod(major7th, i)
      const f = math.denormalized(x ** 4, 0, 10_000)
      const freq = math.denormalized(y, f, f * 2 ** octave * ratio * trans)
      osc.frequency.value = freq
    })

    // Render to the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawSpectrum()
    drawMouse()
  }

  // Begin running the tick function
  requestAnimationFrame(tick)

  try {
    const wakeLock = await navigator.wakeLock.request("screen")
  } catch (err) {
    alert(`${err.name}, ${err.message}`)
  }
}

// HELPERS

function makeSliders(count: number, cb: (index: number, value: number) => void) {
  new Array(count).fill(0).map((v, i) => {
    let slider = document.createElement("input")
    slider.type = "range"
    slider.min = "0"
    slider.max = "1"
    slider.value = "0"
    slider.step = "0.01"
    slider.oninput = () => cb(i, +slider.value)
    document.body.append(slider)
  })
}

function makeOscs(count): OscillatorNode[] {
  return new Array(count).fill(null).map((v, i) => {
    const osc = new OscillatorNode(audio.context)
    const gain = new GainNode(audio.context, { gain: 1 / count })
    osc.connect(gain)
    gain.connect(audio.input)
    osc.start()
    return osc
  })
}

function drawSpectrum() {
  const nBins = audio.analyser.frequencyBinCount
  const binData = new Uint8Array(nBins)
  audio.analyser.getByteFrequencyData(binData)

  ctx.beginPath()
  ctx.lineWidth = 1
  ctx.strokeStyle = "#fff"
  ctx.moveTo(0, window.innerHeight)
  for (let i = 0; i < nBins; i++) {
    let frac = i / nBins
    frac **= 0.25 // This biases the spectrum so that low frequencies are wider, which more closely matches how we perceive pitch
    const x = math.denormalized(frac, 0, window.innerWidth)
    const y = math.renormalized(binData[i], 0, 256, window.innerHeight, 0)
    ctx.lineTo(x, y)
  }
  ctx.stroke()
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
window.addEventListener("pointerup", main, { once: true })
