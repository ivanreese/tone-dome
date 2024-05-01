import * as audio from "./audio"
import * as math from "./math"

// How many different oscillators do we want?
// They all share a periodic wave pattern, but can have different frequencies and gains
// Currently they're assigned to ascending notes in the current chord
const nOscs = 6

// Generate random numbers for each of the oscillators that we can use to shuffle their phases
const perOscRandoms = Array(nOscs)
  .fill(0)
  .map(() => Math.random())

// Chord changes are globally coordinated between all devices, and happen at regular intervals
// TODO: We can modulate this more interestingly later
const chordChangeIntervalSeconds = 10

// This determines how tonally complex our synthesizers are
// This needs to be at least 2 to work
const waveCoefficients = 16

// The high coefficients are noisy and gross, so we limit their intensity fairly low
const maxHighCoefIntensity = 0.1

let real = new Float32Array(waveCoefficients)
let imag = new Float32Array(waveCoefficients)

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
const major = [root, maj3, fifth]
const major7 = [root, maj3, fifth, maj7]
const major7s11 = [root, maj3, fifth, maj7, 2 * dim5]
const minor = [root, min3, fifth]
const minor7 = [root, min3, fifth, min7]
const majorAdd9 = [root, maj3, fifth, 2 * maj2]
const majorAdd11 = [root, maj3, fifth, 2 * fourth]
const major7Add11 = [root, maj3, fifth, 2 * maj2, 2 * fourth]

const chordProgression = [majorAdd9, majorAdd11, major, major7s11, major7, major7Add11, minor, minor7]

const state = {
  chord: 0,
}

export type AudioAPI = {
  tick: (currentTimeInSeconds: number) => void
  pois: { lat: number; lon: number }[]
  state: {
    chord: number
  }
}

export function main(): AudioAPI {
  // Set up the audio context (MUST be done in response to user input)
  audio.setupAudio()

  // Make some oscillators
  const oscs = makeOscs(nOscs)

  const pois = [
    { lat: 1, lon: 2 },
    { lat: 3, lon: 4 },
  ]

  function tick(ms: number) {
    const uniqueTime = ms / 1000
    const globalTime = Date.now() / 1000

    // Chord
    // This uses globalTime, so it's synced across all phones
    state.chord = Math.round(globalTime / chordChangeIntervalSeconds) % chordProgression.length
    const currentChord = math.arrMod(chordProgression, state.chord)

    // Amplitude
    // This uses uniqueTime, so it's unique to each phone
    // It also uses perOscRandoms, so each osc cycles individually
    // It's a sin^20, so it's quick pulses with lots of silence in between
    oscs.forEach((osc, oscIndex) => {
      const phase = math.TAU * perOscRandoms[oscIndex] + uniqueTime
      const currentAmplitude = Math.sin(phase) ** 20
      return setValue(osc.gain.gain, currentAmplitude / nOscs)
    })

    // When this goes high (like 1000) it sounds chaotic and pretty
    // When it goes to near zero (like 2), it sounds organic
    // When it goes to zero, it sounds pure and a bit digital
    const chorus = Math.max(0, Math.tan(uniqueTime / 31) ^ 5)

    // Update the periodic wave for each oscillator
    oscs.forEach((osc, oscIndex) => {
      // The high coefficients surge, driven by uniqueTime and the oscillator index, every coefCycleSeconds
      const coefCycleSeconds = 13
      const oscCoefCycleSeconds = math.rand(0.5, 2) // The speed we cycle coefs in each osc is random on each phone
      const cyclePhase = (Math.PI * uniqueTime) / coefCycleSeconds + (oscCoefCycleSeconds * oscIndex) / nOscs
      const lowCoefIntensity = 1
      const highCoefIntensity = maxHighCoefIntensity * Math.cos(cyclePhase) ** 20

      // Calculate the coefficients for this oscillator's wave
      real = real.map((_, coef) => {
        // We want to ignore the 0th coefficient since that's just DC offset
        if (coef == 0) return 0

        // Calculate frac having skipped the 0th coefficient
        let frac = (coef - 1) / (waveCoefficients - 1)

        frac **= 0.0001

        return math.denormalized(frac, lowCoefIntensity, highCoefIntensity)
      })

      // Generate and apply a wave based on the current coefficients
      const wave = audio.context.createPeriodicWave(real, imag, { disableNormalization: true })
      osc.node.setPeriodicWave(wave)
    })

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

    // Make the oscillators a bit silly
    // oscs.forEach((osc) => (osc.detune.value = 1000 * Math.tan(t / 100)))

    // oscs.forEach((osc) => (osc.detune.value = mouse.x))

    // Pitch warble based on time
    // oscs.forEach((osc) => (osc.detune.value = 50 * Math.sin(t)))

    // Calculate transposition so that we sort of smoothstep through the ratios
    const transTime = 30
    const transFrac = globalTime / transTime
    const lowT = math.arrMod(chromatic, Math.floor(transFrac))
    const hiT = lowT == 11 ? 12 : math.arrMod(chromatic, Math.ceil(transFrac))
    const curvedT = math.denormalized(transFrac % 1, -1, 1) ** 19
    const trans = math.renormalized(curvedT, -1, 1, lowT, hiT)

    // Tune the oscillators
    oscs.forEach((osc, i) => {
      let y = 1 //math.normalized(mouse.y, 0, window.innerHeight)
      let x = 0.3 // math.normalized(mouse.x, 0, window.innerWidth)

      const f = 130.813
      const freq = f * getNoteInScale(currentChord, i) * trans
      setValue(osc.node.frequency, freq + math.rand(-chorus, chorus))
    })
  }

  return { tick, pois, state }
}

// HELPERS

const getNoteInScale = (scale: number[], i: number) => {
  const octave = Math.floor(i / scale.length)
  const step = math.arrMod(scale, i)
  return step * 2 ** octave
}

function setValue(param: AudioParam, value: number) {
  // ramp to the next value before the next frame, assuming 120fps
  param.linearRampToValueAtTime(value, audio.context.currentTime + 1 / 120)
}

function makeOscs(count) {
  return new Array(count).fill(null).map((v, i) => {
    const node = new OscillatorNode(audio.context)
    const gain = new GainNode(audio.context, { gain: 1 / count })
    node.connect(gain)
    gain.connect(audio.input)
    node.start()
    return { node, gain }
  })
}
