import * as math from "./math"

const fftSize = 32768 / 4

export let context: AudioContext
export let sampleRate: number

export let input: GainNode
export let analyser: AnalyserNode

export function setupAudio() {
  context = new window.AudioContext()
  sampleRate = context.sampleRate

  input = new GainNode(context, { gain: 1 })

  analyser = context.createAnalyser()
  analyser.fftSize = fftSize

  const distortion = makeDistortion(5)
  const reverb = makeReverb(1, 1, false)
  const softCompressor = context.createDynamicsCompressor()
  const hardCompressor = context.createDynamicsCompressor()
  const output = context.createGain()

  distortion.wet.value = 0.2
  distortion.dry.value = 1

  reverb.wet.value = 1
  reverb.dry.value = 0.2

  softCompressor.attack.value = 0.05
  softCompressor.knee.value = 10
  softCompressor.ratio.value = 3
  softCompressor.release.value = 0.1
  softCompressor.threshold.value = -20

  hardCompressor.attack.value = 0.003
  hardCompressor.knee.value = 5
  hardCompressor.ratio.value = 15
  hardCompressor.release.value = 0.01
  hardCompressor.threshold.value = -8

  output.gain.value = 1

  // input -> reverb -> soft -> hard -> output

  input.connect(distortion.input)
  distortion.output.connect(reverb.input)
  reverb.output.connect(softCompressor).connect(hardCompressor).connect(output)
  output.connect(analyser).connect(context.destination)
}

function makeReverb(seconds: number, decay: number, reverse: boolean) {
  const wet = context.createGain()
  const dry = context.createGain()
  const input = context.createGain()
  const output = context.createGain()
  const convolver = context.createConvolver()
  const steps = sampleRate * seconds
  const impulse = context.createBuffer(2, steps, sampleRate)
  const impulseL = impulse.getChannelData(0)
  const impulseR = impulse.getChannelData(1)

  for (let i = 0; i < steps; i++) {
    const n = reverse ? steps - i : i
    impulseL[i] = impulseR[i] = math.rand(-1, 1) * (1 - n / steps) ** decay
  }

  convolver.buffer = impulse
  input.connect(dry).connect(output)
  input.connect(convolver).connect(wet).connect(output)
  return {
    input: input,
    output: output,
    wet: wet.gain,
    dry: dry.gain,
  }
}

function makeDistortion(k: number) {
  const wet = context.createGain()
  const dry = context.createGain()
  const input = context.createGain()
  const output = context.createGain()

  const shaper = context.createWaveShaper()
  shaper.curve = new Float32Array(sampleRate).map((_, i: number) => {
    const x = (i * 2) / sampleRate - 1
    return ((3 + k) * Math.atan(Math.sinh(x * 0.25) * 5)) / (Math.PI + k * Math.abs(x))
  })

  input.connect(dry).connect(output)
  input.connect(shaper).connect(wet).connect(output)

  return {
    input: input,
    output: output,
    wet: wet.gain,
    dry: dry.gain,
  }
}
