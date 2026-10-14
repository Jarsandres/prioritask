import { describe, it, expect } from "vitest";
import { HybridLogicalClock, parseHlc, compareHlc, formatHlc } from "../hlc";

describe("HybridLogicalClock (HLC)", () => {
  it("generates strictly monotonic timestamps even within the same physical millisecond", () => {
    const clock = new HybridLogicalClock("tab_alpha");
    const fixedWallTime = 1760000000500;

    const t1 = clock.now(fixedWallTime);
    const t2 = clock.now(fixedWallTime);
    const t3 = clock.now(fixedWallTime);

    expect(t1).toBe("1760000000500:0000:tab_alpha");
    expect(t2).toBe("1760000000500:0001:tab_alpha");
    expect(t3).toBe("1760000000500:0002:tab_alpha");

    expect(compareHlc(t1, t2)).toBeLessThan(0);
    expect(compareHlc(t2, t3)).toBeLessThan(0);
    expect(t1 < t2 && t2 < t3).toBe(true);
  });

  it("maintains strict monotonicity when wall clock drifts backward (clock skew)", () => {
    const clock = new HybridLogicalClock("tab_beta");

    const t1 = clock.now(2000);
    // El reloj físico del navegador retrocede 500ms
    const t2 = clock.now(1500);
    const t3 = clock.now(1999);
    // El reloj físico supera finalmente a lastPhysicalMs
    const t4 = clock.now(2005);

    expect(parseHlc(t1)).toEqual({
      physicalMs: 2000,
      counter: 0,
      nodeId: "tab_beta",
      raw: t1,
    });
    expect(parseHlc(t2)).toEqual({
      physicalMs: 2000,
      counter: 1,
      nodeId: "tab_beta",
      raw: t2,
    });
    expect(parseHlc(t3)).toEqual({
      physicalMs: 2000,
      counter: 2,
      nodeId: "tab_beta",
      raw: t3,
    });
    expect(parseHlc(t4)).toEqual({
      physicalMs: 2005,
      counter: 0,
      nodeId: "tab_beta",
      raw: t4,
    });

    expect(compareHlc(t1, t2)).toBeLessThan(0);
    expect(compareHlc(t2, t3)).toBeLessThan(0);
    expect(compareHlc(t3, t4)).toBeLessThan(0);
  });

  it("advances causal state on receive() when remote clock is ahead of local clock", () => {
    const localClock = new HybridLogicalClock("node_local", 1000, 0);
    const remoteFutureHlc = formatHlc(5000, 7, "node_remote");

    const mergedHlc = localClock.receive(remoteFutureHlc, 1200);
    const parsed = parseHlc(mergedHlc);

    expect(parsed.physicalMs).toBe(5000);
    expect(parsed.counter).toBe(8);
    expect(parsed.nodeId).toBe("node_local");
    expect(compareHlc(remoteFutureHlc, mergedHlc)).toBeLessThan(0);

    // El siguiente evento local a wallTime = 1300 sigue siendo monótono respecto a 5000:0008
    const nextLocal = localClock.now(1300);
    expect(parseHlc(nextLocal).physicalMs).toBe(5000);
    expect(parseHlc(nextLocal).counter).toBe(9);
  });

  it("orders HLC strings deterministically by physicalMs, counter, and nodeId tie-breaker", () => {
    const a = formatHlc(3000, 1, "node_a");
    const b = formatHlc(3000, 1, "node_b");
    const c = formatHlc(3000, 2, "node_a");
    const d = formatHlc(3001, 0, "node_a");

    const shuffled = [d, b, c, a];
    shuffled.sort(compareHlc);

    expect(shuffled).toEqual([a, b, c, d]);
    expect(compareHlc(a, a)).toBe(0);
  });

  it("rejects remote HLC timestamps exceeding maximum future drift threshold (+300s)", () => {
    const clock = new HybridLogicalClock("test_node", 1000);
    const wallTimeMs = 1_000_000;
    const futureAttackerHlc = "9999999999999:0000:attacker";

    expect(() => {
      clock.receive(futureAttackerHlc, wallTimeMs);
    }).toThrow("El timestamp HLC excede la deriva futura máxima permitida");
  });
});
