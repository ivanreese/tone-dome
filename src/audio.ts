import * as math from "./math"

const fftSize = 16384

export let context: AudioContext
export let sampleRate: number

export let input: GainNode
export let analyser: AnalyserNode

function makeReverb(seconds: number, decay: number, reverse: boolean) {
  const wet = context.createGain()
  const dry = context.createGain()
  const input = context.createGain()
  const output = context.createGain()
  const convolver = context.createConvolver()
  const duration = sampleRate * seconds
  const impulse = context.createBuffer(2, duration, sampleRate)
  const impulseL = impulse.getChannelData(0)
  const impulseR = impulse.getChannelData(1)

  for (let i = 0; i < duration; i++) {
    const n = reverse ? duration - i : i
    impulseL[i] = impulseR[i] = math.rand(-1, 1) * (1 - n / duration) ** decay
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

export function setupAudio() {
  context = new window.AudioContext()
  sampleRate = context.sampleRate

  input = new GainNode(context, { gain: 1 })

  analyser = context.createAnalyser()
  analyser.fftSize = fftSize

  const reverb = makeReverb(3, 2, false)
  const softCompressor = context.createDynamicsCompressor()
  const hardCompressor = context.createDynamicsCompressor()
  const output = context.createGain()

  reverb.wet.value = 0
  reverb.dry.value = 1

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

  input.connect(reverb.input)
  reverb.output.connect(softCompressor).connect(hardCompressor).connect(output)
  output.connect(analyser).connect(context.destination)
}
