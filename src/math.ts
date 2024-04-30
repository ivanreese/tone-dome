export const TAU = Math.PI * 2

// keep i between min and max
export const clip = (i: number, min = 0, max = 1) => Math.min(Math.max(i, min), max)

// get what i would be if min became 0 and max became 1
export const normalized = (i: number, min: number, max: number) => (max === min ? min : (i - min) / (max - min))

// get what i would be if 0 became min and 1 became max
export const denormalized = (i: number, min: number, max: number) => i * (max - min) + min

// normalize to [min1,max1] then denormalize to [min2,max2]
export const renormalized = (i: number, min1: number, max1: number, min2: number, max2: number) => denormalized(normalized(i, min1, max1), min2, max2)

// random float in the range [min,max)
export const rand = (min = 0, max = 1) => denormalized(Math.random(), min, max)

// random int in the range [min,max]
export const randInt = (min = 0, max = 1) => Math.round(rand(min, max))

// like %, but without mirroring at 0
export const mod = (n: number, m: number = 1) => ((n % m) + m) % m

// THESE SHOULDN'T BE HERE

// return a random element of an array
export const arrRand = (arr: any[]) => arr[rand(0, arr.length) | 0]

// return an element from the array, wrapping around if the index is out of bounds
export const arrMod = (arr: any[], i: number) => arr[mod(i, arr.length)]

// generate hsl string from separate h,s,l[,a] values, all in the range 0-1
export const hsl = (h: number, s: number, l: number, a: number = 1): string => `hsl(${mod(h) * 360} ${s * 100}% ${l * 100}%)`
