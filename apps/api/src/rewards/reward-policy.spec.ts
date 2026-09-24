import { BOARD_LAYOUT, BOARD_TILES, PRIZES, STICKERS, WHEEL_SEGMENTS, WEIGHT_SCALE, boliviaDayKey, boliviaMonthStart, pickWeighted, type RandomSource } from "./reward-policy";

function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return { int: (max) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % max; } };
}

describe("reward policy", () => {
  it("wheel weights sum to 100", () => {
    expect(WHEEL_SEGMENTS.reduce((sum, s) => sum + s.weight, 0)).toBe(100);
  });

  it("draws each wheel prize within half a point of its weight", () => {
    const random = seeded(42);
    const hits = new Array(WHEEL_SEGMENTS.length).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) hits[pickWeighted(random)]++;
    WHEEL_SEGMENTS.forEach((segment, index) => {
      expect(Math.abs((hits[index] / draws) * 100 - segment.weight)).toBeLessThan(0.5);
    });
  });

  it("maps the extreme rolls onto the first and last segments", () => {
    const total = 100 * WEIGHT_SCALE;
    expect(pickWeighted({ int: () => 0 })).toBe(0);
    expect(pickWeighted({ int: () => total - 1 })).toBe(WHEEL_SEGMENTS.length - 1);
  });

  it("board has 24 tiles with the agreed mix and expensive tiles six apart", () => {
    expect(BOARD_LAYOUT).toHaveLength(BOARD_TILES);
    const count = (key: string) => BOARD_LAYOUT.filter((k) => k === key).length;
    expect({ sc: count("STICKER_COMMON"), x25: count("XP_25"), tip: count("TIP"), x50: count("XP_50"), rare: count("STICKER_RARE"), x200: count("XP_200"), ai5: count("AI_CREDITS_5"), ai25: count("AI_CREDITS_25") })
      .toEqual({ sc: 9, x25: 5, tip: 3, x50: 3, rare: 1, x200: 1, ai5: 1, ai25: 1 });
    const expensive = BOARD_LAYOUT.map((k, i) => (["STICKER_RARE", "XP_200", "AI_CREDITS_5", "AI_CREDITS_25"].includes(k) ? i : -1)).filter((i) => i >= 0);
    expect(expensive).toEqual([3, 9, 15, 21]);
  });

  it("XP and credit prizes carry the agreed amounts", () => {
    expect([PRIZES.XP_25.amount, PRIZES.XP_50.amount, PRIZES.XP_200.amount, PRIZES.AI_CREDITS_5.amount, PRIZES.AI_CREDITS_25.amount]).toEqual([25, 50, 200, 5, 25]);
    expect(STICKERS.filter((s) => s.rare)).toHaveLength(2);
    expect(STICKERS.filter((s) => !s.rare)).toHaveLength(7);
  });

  it("uses the Bolivia calendar day, not UTC", () => {
    expect(boliviaDayKey(new Date("2026-09-25T03:59:00Z"))).toBe("2026-09-24");
    expect(boliviaDayKey(new Date("2026-09-25T04:01:00Z"))).toBe("2026-09-25");
    expect(boliviaMonthStart(new Date("2026-10-01T03:00:00Z")).toISOString()).toBe("2026-09-01T04:00:00.000Z");
  });
});
