import * as audio from "./audio"
import * as math from "./math"

const waveCoefficients = 4
const real = new Float32Array(waveCoefficients)
const imag = new Float32Array(waveCoefficients)

const root = 1
const min2 = 256 / 243
const maj2 = 9 / 8
const min3 = 32 / 27
const maj3 = 81 / 64
const fourth = 4 / 3
const dim5 = 1024 / 729
const fifth = 3 / 2
const min6 = 128 / 81
const maj6 = 27 / 16
const min7 = 16 / 9
const maj7 = 243 / 128

const chromatic = [root, min2, maj2, min3, maj3, fourth, dim5, fifth, min6, maj6, min7, maj7]
const diatonic = [root, maj2, maj3, fourth, fifth, maj6, maj7]
const major7th = [root, maj3, fifth, maj7]
const minor7th = [root, min3, fifth, min7]

const getNoteInScale = (scale: number[], i: number) => {
  const octave = Math.floor(i / scale.length)
  const step = math.arrMod(scale, i)
  return step * 2 ** octave
}

const chords = [major7th, minor7th]

export type AudioAPI = {
  tick: (currentTimeInSeconds: number) => void
  pois: { lat: number; lon: number }[]
}

export function main(): AudioAPI {
  // Set up the audio context (MUST be done in response to user input)
  audio.setupAudio()

  // Make some oscillators
  const oscs = makeOscs(15)

  // Create some sliders for testing waveCoefficients
  // We skip the first coefficient because it's just DC offset
  // makeSliders(waveCoefficients - 1, (i, v) => (real[i + 1] = v))

  real[1] = 1

  const pois = [
    { lat: 1, lon: 2 },
    { lat: 3, lon: 4 },
  ]

  function tick(t: number) {
    // Current chord
    const chordIndex = Math.round(t / 1)
    const currentChord = math.arrMod(chords, chordIndex)

    // Modulate the coeficients to create interesting ambience
    for (let i = 0; i < waveCoefficients; i++) {
      const frac = i / waveCoefficients

      // let innerCycle = Math.sin(frac * t)
      // let outerCycle = Math.sin(frac * innerCycle)
      // imag[i] = (1 - frac) * outerCycle

      // let c = Math.cos(t)
      // let p = Math.pow(c, Math.round((2 * t) % 3))
      // const beat = Math.round(Math.sin(p * math.TAU))
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

    // real[1] = math.impulse((t / 1) % 2)

    // Create a new PeriodicWave every frame, using the current real / imag coefficients
    const wave = audio.context.createPeriodicWave(real, imag, { disableNormalization: true })

    // Update all oscillators to use this new PeriodicWave
    oscs.forEach((osc) => osc.setPeriodicWave(wave))

    // Make the oscillators a bit silly
    // oscs.forEach((osc) => (osc.detune.value = 1000 * Math.tan(t / 100)))

    // oscs.forEach((osc) => (osc.detune.value = mouse.x))

    // Pitch warble based on time
    // oscs.forEach((osc) => (osc.detune.value = 50 * Math.sin(t)))

    // Calculate transposition so that we sort of smoothstep through the ratios
    const transTime = 20
    const transFrac = t / transTime
    const lowT = math.arrMod(chromatic, Math.floor(transFrac))
    const hiT = lowT == 11 ? 12 : math.arrMod(chromatic, Math.ceil(transFrac))
    const curvedT = math.denormalized(transFrac % 1, -1, 1) ** 7
    const trans = math.renormalized(curvedT, -1, 1, lowT, hiT)

    // Tune the oscillators
    oscs.forEach((osc, i) => {
      let y = 1 //math.normalized(mouse.y, 0, window.innerHeight)
      let x = 0.3 // math.normalized(mouse.x, 0, window.innerWidth)

      const f = 130.813
      const freq = f * getNoteInScale(currentChord, i)
      osc.frequency.value = freq
    })
  }

  return { tick, pois }
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
