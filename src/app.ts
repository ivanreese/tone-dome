import * as audio from "./audio"
import * as math from "./math"

// How many different oscillators do we want?
// They each independently cycle their amplitudes, wave coefficients, etc
// They each get a successive note in the current chord/scale
const oscCount = 12

// Continually vary the number of oscillators we're hearing
const oscActiveCycleSeconds = 27 // Global
const oscMinActive = 4

// This determines how texturally complex our oscillators sound
// This needs to be at least 2 to work
const coefCount = 16

// The high coefficients are noisy and gross, so we limit their intensity
const coefMaxIntensity = 0.1

// Every so often, surge the high coefficients
const coefSurgeIntervalSeconds = 13 // Unique

// Every so often, change the chord/scale that the oscillators play
const chordChangeIntervalSeconds = 11 // Global

// Every so often, change the root note of the chord/scale
const transpositionIntervalSeconds = 37 // Global

// Continually bend the pitch up and down a little
const detuneCycleSeconds = 7 // Global
const detuneIntensity = 35

// Every so often, surge the heavy distortion
const distortionIntervalSeconds = 129 // Unique

// Every so often, blorp
const blorpIntervalSeconds = 47 // Unique

// We treat C as our root frequency
const rootFrequency = 130.813

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
const circleOfFifths = [root, fifth, maj2, maj6, maj3, maj7, dim5, min2, min6, min3, min7, fourth]
const diatonic = [root, maj2, maj3, fourth, fifth, maj6, maj7]
const major = [root, maj3, fifth]
const major7 = [root, maj3, fifth, maj7]
const major7s11 = [root, maj3, fifth, maj7, 2 * dim5]
const minor = [root, min3, fifth]
const minor7 = [root, min3, fifth, min7]
const majorAdd9 = [root, maj3, fifth, 2 * maj2]
const majorAdd11 = [root, maj3, fifth, 2 * fourth]
const major7Add11 = [root, maj3, fifth, 2 * maj2, 2 * fourth]

const chordProgression = [major7Add11, minor, minor7, majorAdd9, majorAdd11, major, major7s11, major7]

export type AudioTick = (msFromRequestAnimationFrame: number, inputs: AudioInputs) => void
export type AudioInputs = {
  orientation: { x: number; y: number; z: number }
  pois: Array<{
    lat: number
    lon: number
    collected: boolean // Has this POI been collected?
    type: number // What type of POI is this? (treat it like an enum — 0 is one type, 1 is another, etc. Maybe 4 or 5 total?)
    distance: number // How far away is the POI?
    direction: number // Which way is the POI relative to the phone? 0 for straight ahead, -90 for to the left, 90 for to the right, maybe?
  }>
  effects: {
    blorpAtMs: number // Set this to the current msFromRequestAnimationFrame whenever I should run a blorp.
    maxActive: number // Set this to whatever number of oscillators should be active (recommend between 4 and 12)
    maxChords: number // Set this to whatever number of chords the system is allowed to cycle through (recommend between 1 and 8)
    doDetune: number // Set this to 1 to make the detune effect active
    doDomeMode: number // Set this to 1 to play extra notes
    doDistortion: number // Set this to 1 to make the distortion effect active
    doFlicker: number // Set this to 1 to make the flicker effect active
    doTransposition: number // Set this to 1 to make the transposition effect active
  }
}

// This is all the stuff you can use to generate dynamic visuals that match the audio
export type AudioState = {
  active: number ///////// 0 to 1 • what fraction of the oscillators are allowed to make sound
  amplitude: number ////// 0 to 1 • overall loudness of the audio (pre-reverb, so doesn't match exactly)
  chord: number ////////// 0 to 1 • changes every time the chord changes, in a stairstep pattern (once every ~10 seconds)
  chorus: number ///////// 0 to 1 • surges up toward infinity whenever a "blorp" happens
  detune: number ///////// 0 to 1 • the pitch continually drifts up and down
  distortion: number ///// 0 to 1 • surges when the sound gets heavily fuzzed out (once every ~2 minutes)
  flicker: number //////// 0 to 1 • overall amount of flickering high-frequency sound in this oscillator
  transposition: number // 0 to 1 • sweeps up and down as the pitch changes (once every ~30 seconds)
  oscillators: Array<{
    amplitude: number //// 0 to 1 • loudness of the oscillator (pre-reverb, so doesn't match exactly)
    flicker: number ////// 0 to 1 • amount of flickering high-frequency sound in this oscillator
  }>
  pois: Array<{
    amplitude: number //// 0 to 1 • loudness of the POI (pre-reverb, so doesn't match exactly)
    note: number ///////// 0 to 1 • which part of the current chord/scale is this POI playing
  }>
}

export type AudioAPI = { tick: AudioTick; state: AudioState }

export function main(runAnalysis = false): AudioAPI {
  // Set up the audio context (MUST be done in response to user input)
  const fx = audio.setupAudio(runAnalysis)

  // Make some oscillators
  const oscs = makeOscs(oscCount)
  const col = makeCollectable()

  const stateOscillators = Array.from({ length: oscCount }, () => ({ amplitude: 0, flicker: 0 }))
  const statePois = [{ amplitude: 0, note: 0 }]

  const state: AudioState = { active: 0, amplitude: 0, chord: 0, chorus: 0, detune: 0, distortion: 0, flicker: 0, transposition: 0, oscillators: stateOscillators, pois: statePois }

  function tick(ms: number, inputs: AudioInputs) {
    const uniqueTime = ms / 1000
    const globalTime = Date.now() / 1000

    // Transposition
    const transFrac = (inputs.effects.doTransposition * globalTime) / transpositionIntervalSeconds
    const lowT = math.arrMod(chromatic, Math.floor(transFrac))
    const hiT = lowT == 11 ? 12 : math.arrMod(chromatic, Math.ceil(transFrac))
    const curvedT = math.denormalized(transFrac % 1, -1, 1) ** 13
    const trans = math.renormalized(curvedT, -1, 1, lowT, hiT)
    const transRootFreq = rootFrequency * trans
    state.transposition = Math.abs(curvedT)

    // Chord
    const chord = Math.round(globalTime / chordChangeIntervalSeconds)
    const chordIndex = chord % Math.min(chordProgression.length, inputs.effects.maxChords)
    const currentChord = chordProgression[chordIndex]
    state.chord = chordIndex / chordProgression.length

    // Chorus
    // When this goes high (like 1000) it sounds chaotic and pretty
    // When it goes to near zero (like 2), it sounds organic
    // When it goes to zero, it sounds pure and a bit digital
    // const chorus = Math.max(0, Math.tan((Math.PI * uniqueTime) / blorpIntervalSeconds) ^ 5) // Bitwise happy accident
    const chorus = math.impulse((ms - inputs.effects.blorpAtMs) / 1000)
    state.chorus = chorus

    // Detune
    const detune = inputs.effects.doDetune * detuneIntensity * Math.sin((math.TAU * globalTime) / detuneCycleSeconds)
    state.detune = math.renormalized(detune, -detuneIntensity, detuneIntensity, 0, 1)

    // Active
    const oscActiveSin = Math.sin((math.TAU * globalTime) / oscActiveCycleSeconds)
    const oscActiveCountCycling = math.renormalized(oscActiveSin, -1, 1, oscMinActive, oscCount)
    const oscActiveCount = Math.min(inputs.effects.maxActive, oscActiveCountCycling)
    state.active = math.renormalized(oscActiveSin, -1, 1, 0, 1)

    // Heavy distortion
    const distortion = inputs.effects.doDistortion * Math.sin((Math.PI * uniqueTime) / distortionIntervalSeconds) ** 80
    setValue(fx.heavyDistortion.wet, distortion)
    setValue(fx.heavyDistortion.dry, 1 - distortion)
    state.distortion = distortion

    // These state values are accumulated as we loop the oscillators
    state.amplitude = 0
    state.flicker = 0

    // Oscillators
    oscs.forEach((osc, oscIndex) => {
      // Frequency
      const freq = transRootFreq * getNoteInScale(currentChord, oscIndex) + math.rand(-chorus * 1000, chorus * 1000)
      setValue(osc.nodeLow.frequency, freq)
      setValue(osc.nodeHigh.frequency, freq)

      // Detune
      setValue(osc.nodeLow.detune, detune)
      setValue(osc.nodeHigh.detune, detune)

      // Active
      const activeAmplitude = math.clip(oscActiveCount - oscIndex)

      // Amplitude
      const amplitudePhase = Math.PI * osc.rand + uniqueTime
      const amplitudeActiveModulated = activeAmplitude * Math.sin(amplitudePhase) ** 20
      const amplitudeDomeMode = inputs.effects.doDomeMode * math.impulse(amplitudePhase % 4)
      const amplitudeChorus = 0.5 * chorus
      const amplitude = Math.min(1, amplitudeActiveModulated + amplitudeDomeMode + amplitudeChorus)
      const scaledAmplitude = amplitude / oscCount
      state.oscillators[oscIndex].amplitude = amplitude
      state.amplitude += scaledAmplitude

      // Coefficients
      const coefPhaseFlicker = math.rand(0.5, 2)
      const coefPhase = (Math.PI * uniqueTime) / coefSurgeIntervalSeconds + (coefPhaseFlicker * oscIndex) / oscCount
      const coefIntensity = inputs.effects.doFlicker * Math.cos(coefPhase) ** 20
      const scaledCoefIntensity = coefIntensity * coefMaxIntensity
      state.oscillators[oscIndex].flicker = amplitude * coefIntensity
      state.flicker += (amplitude * coefIntensity) / oscCount

      setValue(osc.gainLow.gain, scaledAmplitude)
      setValue(osc.gainHigh.gain, scaledAmplitude * scaledCoefIntensity)
    })

    // Collectables
    const stateAmpInverse = math.denormalized(math.clip(math.normalized(state.amplitude, 0, 0.3)), 1, 0.1)
    const colFlicker = math.rand(-0.2, 0.2)
    const colPulse = Math.round((1.7 * uniqueTime + colFlicker) % 1) * Number((uniqueTime + colFlicker) % 7 < 1.5)

    // Each collectable
    // TODO: consider the .type property!
    if (inputs.pois[0]) {
      const colNote = Math.round(uniqueTime % 4)
      const colFreq = transRootFreq * getNoteInScale(currentChord, colNote) * 2
      setValue(col.node.frequency, colFreq)
      setValue(col.node.detune, detune)
      setValue(col.pan.pan, math.renormalized(inputs.pois[0].direction, -90, 90, -1, 1))
      const colCollected = inputs.pois[0].collected
      const colSteady = math.clip(math.normalized(state.amplitude, 0, 0.3))
      const colGainPulse = colCollected ? colSteady : colPulse / Math.max(1, inputs.pois[0].distance)
      const colAmplitude = stateAmpInverse * colGainPulse * 0.2
      setValue(col.gain.gain, colAmplitude)
      state.pois[0].amplitude = colGainPulse
      state.pois[0].note = colNote / 4
    } else {
      setValue(col.gain.gain, 0)
    }
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
  return Array.from({ length: count }, (_, i) => {
    const nodeLow = new OscillatorNode(audio.context)
    const nodeHigh = new OscillatorNode(audio.context)

    const dir = i % 2 == 0 ? 1 : -1
    const panLow = new StereoPannerNode(audio.context, { pan: math.renormalized(i, 0, count, 0, dir) })
    const panHigh = new StereoPannerNode(audio.context, { pan: math.renormalized(i, 0, count, 0, -dir) })

    let real = new Float32Array(coefCount)
    let imag = new Float32Array(coefCount)

    real = real.map((_, coef) => {
      if (coef == 0) return 0
      let frac = (coef - 1) / (coefCount - 1)
      frac **= 0.0001
      return math.denormalized(frac, 1, 0)
    })
    nodeLow.setPeriodicWave(audio.context.createPeriodicWave(real, imag, { disableNormalization: true }))

    real = real.map((_, coef) => (coef == 0 ? 0 : 1))
    nodeHigh.setPeriodicWave(audio.context.createPeriodicWave(real, imag, { disableNormalization: true }))

    const gainLow = new GainNode(audio.context)
    const gainHigh = new GainNode(audio.context)

    nodeLow.connect(gainLow).connect(panLow).connect(audio.input)
    nodeHigh.connect(gainHigh).connect(panHigh).connect(audio.input)

    nodeLow.start()
    nodeHigh.start()

    // each oscillator gets a unique random value we can use to shuffle phases and such
    const rand = Math.random()

    return { nodeLow, nodeHigh, gainLow, gainHigh, rand }
  })
}

function makeCollectable() {
  const node = new OscillatorNode(audio.context, { type: "sawtooth" })
  const pan = new StereoPannerNode(audio.context)
  const gain = new GainNode(audio.context)
  node.connect(gain).connect(pan).connect(audio.input)
  node.start()
  return { node, pan, gain }
}
