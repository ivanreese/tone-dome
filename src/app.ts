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

// Every so often, surge the heavy distortion
const distortionIntervalSeconds = 149

// Every so often, blorp
const blorbIntervalSeconds = 47

// This determines how tonally complex our synthesizers are
// This needs to be at least 2 to work
const waveCoefficients = 16

// The high coefficients are noisy and gross, so we limit their intensity fairly low
const maxHighCoefIntensity = 0.1
const coefCycleSeconds = 13

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

export type Orientation = { x: number; y: number; z: number }
export type POIs = { lat: number; lon: number; collected: boolean; type: number }[]
export type AudioTick = (msFromRequestAnimationFrame: number, orientation: Orientation, pois: POIs) => void
export type AudioState = {
  amplitude: number // unknown range (TODO)
  chord: number // 0 to 1
  chorus: number // unknown range (TODO)
  distortion: number // unknown range (TODO)
  transposition: number // -1 to 1, mostly hovers around 0
}
export type AudioAPI = {
  tick: AudioTick
  state: AudioState
}

export function main(runAnalysis = false): AudioAPI {
  // Set up the audio context (MUST be done in response to user input)
  const fx = audio.setupAudio(runAnalysis)

  // Make some oscillators
  const oscs = makeOscs(nOscs)

  const state: AudioState = { amplitude: 0, chord: 0, chorus: 0, distortion: 0, transposition: 0 }

  function tick(ms: number, orientation: Orientation) {
    const uniqueTime = ms / 1000
    const globalTime = Date.now() / 1000

    // Chord
    // This uses globalTime, so it's synced across all phones
    const chord = Math.round(globalTime / chordChangeIntervalSeconds)
    const currentChord = math.arrMod(chordProgression, chord)
    state.chord = (chord / chordProgression.length) % 1

    // Amplitude
    // This uses uniqueTime, so it's unique to each phone
    // It also uses perOscRandoms, so each osc cycles individually
    // It's a sin^20, so it's quick pulses with lots of silence in between
    state.amplitude = 0

    oscs.forEach((osc, oscIndex) => {
      const phase = math.TAU * perOscRandoms[oscIndex] + uniqueTime // TODO: This might be worth exploring / exposing
      const currentAmplitude = Math.sin(phase) ** 20
      osc.amp = currentAmplitude / nOscs
      state.amplitude += currentAmplitude / nOscs

      // The high coefficients surge, driven by uniqueTime and the oscillator index, every coefCycleSeconds
      const oscCoefCycleSeconds = math.rand(0.5, 2) // The speed we cycle coefs in each osc is random on each phone
      const cyclePhase = (Math.PI * uniqueTime) / coefCycleSeconds + (oscCoefCycleSeconds * oscIndex) / nOscs
      const lowCoefIntensity = 1
      const highCoefIntensity = maxHighCoefIntensity * Math.cos(cyclePhase) ** 20

      setValue(osc.gainLow.gain, osc.amp)
      setValue(osc.gainHigh.gain, osc.amp * highCoefIntensity)
    })

    // Chorus
    // When this goes high (like 1000) it sounds chaotic and pretty
    // When it goes to near zero (like 2), it sounds organic
    // When it goes to zero, it sounds pure and a bit digital
    const blorpChorus = Math.max(0, Math.tan((math.TAU * uniqueTime) / blorbIntervalSeconds) ^ 5)
    const orientationChorus = 300 * (Math.abs(orientation.y) / 90) ** 30
    const chorus = blorpChorus + orientationChorus
    state.chorus = chorus

    // Heavy distortion
    const distortion = Math.sin((Math.PI * uniqueTime) / distortionIntervalSeconds) ** 80
    setValue(fx.heavyDistortion.wet, distortion)
    state.distortion = distortion

    // Make the oscillators a bit silly
    // oscs.forEach((osc) => (osc.detune.value = 1000 * Math.tan(globalTime / 100)))

    // Pitch warble based on time
    // oscs.forEach((osc) => (osc.detune.value = 50 * Math.sin(globalTime)))

    // Calculate transposition so that we sort of smoothstep through the ratios
    const transTime = 30
    const transFrac = globalTime / transTime
    const lowT = math.arrMod(chromatic, Math.floor(transFrac))
    const hiT = lowT == 11 ? 12 : math.arrMod(chromatic, Math.ceil(transFrac))
    const curvedT = math.denormalized(transFrac % 1, -1, 1) ** 19
    const trans = math.renormalized(curvedT, -1, 1, lowT, hiT)
    state.transposition = curvedT

    // Tune the oscillators
    oscs.forEach((osc, i) => {
      const f = 130.813
      const freq = f * getNoteInScale(currentChord, i) * trans
      setValue(osc.nodeLow.frequency, freq + math.rand(-chorus, chorus))
      setValue(osc.nodeHigh.frequency, freq + math.rand(-chorus, chorus))
    })
  }

  return { tick, state }
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
    const nodeLow = new OscillatorNode(audio.context)
    const nodeHigh = new OscillatorNode(audio.context)

    let real = new Float32Array(waveCoefficients)
    let imag = new Float32Array(waveCoefficients)

    real = real.map((_, coef) => {
      if (coef == 0) return 0
      let frac = (coef - 1) / (waveCoefficients - 1)
      frac **= 0.0001
      return math.denormalized(frac, 1, 0)
    })
    nodeLow.setPeriodicWave(audio.context.createPeriodicWave(real, imag, { disableNormalization: true }))

    real = real.map((_, coef) => (coef == 0 ? 0 : 1))
    nodeHigh.setPeriodicWave(audio.context.createPeriodicWave(real, imag, { disableNormalization: true }))

    const gainLow = new GainNode(audio.context)
    const gainHigh = new GainNode(audio.context)

    nodeLow.connect(gainLow).connect(audio.input)
    nodeHigh.connect(gainHigh).connect(audio.input)

    nodeLow.start()
    nodeHigh.start()

    return { nodeLow, nodeHigh, gainLow, gainHigh, amp: 0 }
  })
}
