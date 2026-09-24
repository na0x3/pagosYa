import { randomInt } from "node:crypto";
import type { RandomSource } from "./reward-policy";

export const REWARD_RANDOM = Symbol("REWARD_RANDOM");
export const cryptoRandom: RandomSource = { int: (maxExclusive) => randomInt(maxExclusive) };
