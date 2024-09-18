import { main, AudioState } from "./app"
import * as audio from "./audio"
import * as math from "./math"

const rendering = true

const canvas = document.querySelector("canvas")
const ctx = canvas.getContext("2d")
let width = window.innerWidth
let height = window.innerHeight

const mouse = { x: 0, y: 0, down: false }

const inputs = {
  orientation: { x: 0, y: 0, z: 0 },
  oscillators: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  flickers: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  effects: {
    blorpAtMs: -100000,
    detuneAtMs: -100000,
    distortAtMs: -100000,
    doBass: 0,
    doMelody: 0,
    doPulse: 0,
  },
}

async function init() {
  document.querySelector("h1").remove()

  try {
    navigator.wakeLock.request("screen")
  } catch {}

  const audioAPI = main(rendering)

  function tick(ms: number) {
    audioAPI.tick(ms, inputs)

    if (rendering) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawSpectrum(audioAPI.state)
      drawCircles(audioAPI.state, ms)
    }

    mouse.down = false
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function drawSpectrum(state: AudioState) {
  const nBins = audio.analyser.frequencyBinCount
  const binData = new Uint8Array(nBins)
  audio.analyser.getByteFrequencyData(binData)

  const l = math.denormalized(state.flicker, 40, 100)
  const c = math.denormalized(state.transposition, 20, 200)
  const h = state.chord * 360
  ctx.fillStyle = `lch(${l} ${c} ${h})`

  for (let i = 0; i < nBins; i++) {
    let frac = i / nBins
    const dir = i % 2 == 0 ? 1 : -1
    const hw = window.innerWidth / 2
    const x = hw + frac * dir * hw
    const y = (1 - binData[i] / 256) * window.innerHeight
    const scaleDistortion = 5 * state.distortion
    const scaleFrac = (1 - frac) ** 2
    const scaledAmplitude = 1.5 * state.amplitude + 0.5
    const scaleMin = 0.2
    let scale = (scaleDistortion + scaleFrac) * scaledAmplitude + scaleMin
    ctx.fillRect(x - 2 * scale, y, 4 * scale, 8 * scale)
  }
}

function drawCircles(state: AudioState, ms: number) {
  state.oscillators.forEach((osc, i) => {
    const o = inputs.oscillators[i]
    const f = inputs.flickers[i]
    addCircle(`osc ${i} amp`, 1, i, osc.amplitude, o, () => (inputs.oscillators[i] = o == 1 ? 0 : 1))
    addCircle(`osc ${i} flicker`, 2, i, osc.flicker, f, () => (inputs.flickers[i] = f == 1 ? 0 : 1))
  })

  const fx = inputs.effects
  addCircle("active", 0, 0, state.active, -1)
  addCircle("amplitude", 0, 1, state.amplitude, -1)
  addCircle("chord", 0, 2, state.chord, -1)
  addCircle("flicker", 0, 3, state.flicker, -1)
  addCircle("transposition", 0, 4, state.transposition, -1)

  addCircle("chorus", 0, 6, state.chorus, state.chorus, () => (fx.blorpAtMs = ms))
  addCircle("detune", 0, 7, state.detune, state.detune, () => (fx.detuneAtMs = ms))
  addCircle("distortion", 0, 8, state.distortion, state.distortion, () => (fx.distortAtMs = ms))
  addCircle("bass", 0, 9, state.bass.amplitude, fx.doBass, () => (fx.doBass = fx.doBass == 0 ? 1 : 0))
  addCircle("melody", 0, 10, state.melody.amplitude, fx.doMelody, () => (fx.doMelody = fx.doMelody == 0 ? 1 : 0))
  addCircle("pulse", 0, 11, state.pulse, fx.doPulse, () => (fx.doPulse = fx.doPulse == 0 ? 1 : 0))
}

function addCircle(name: string, x: number, y: number, size: number, color: number, cb?: Function) {
  ctx.beginPath()
  ctx.fillStyle = "#0001"
  const cx = 25 + x * 150
  const cy = 25 + y * 45
  const r = 20
  ctx.arc(cx, cy, r, 0, math.TAU)
  ctx.fill()
  ctx.beginPath()
  ctx.fillStyle = color < 0 ? "#fff" : color > 0.01 ? "lch(65% 132 178)" : "#333"
  ctx.arc(cx, cy, Math.max(0, r * size), 0, math.TAU)
  ctx.fill()
  ctx.fillText(name, 50 + x * 150, cy)

  if (mouse.down && distToMouse(cx, cy) <= r && cb) cb()
}

function distToMouse(x, y) {
  return Math.sqrt((x - mouse.x) ** 2 + (y - mouse.y) ** 2)
}

function resize() {
  const dpi = window.devicePixelRatio
  width = window.innerWidth
  height = window.innerHeight
  canvas.width = dpi * width
  canvas.height = dpi * height
  ctx.resetTransform()
  ctx.scale(dpi, dpi)
  ctx.font = "12px sans-serif"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
}

window.addEventListener("resize", resize)
resize()

window.addEventListener("pointermove", (e) => {
  mouse.x = e.clientX
  mouse.y = e.clientY
})

window.addEventListener("pointerdown", (e) => (mouse.down = true))
window.addEventListener("pointerup", (e) => (mouse.down = false))

window.addEventListener("pointerup", init, { once: true })
