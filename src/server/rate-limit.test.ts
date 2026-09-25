import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("bloque au-delà de la limite puis libère après la fenêtre", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("test-a:u1", 3, 1000, t0 + i).allowed).toBe(true);
    const blocked = rateLimit("test-a:u1", 3, 1000, t0 + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterS).toBe(1);
    expect(rateLimit("test-a:u1", 3, 1000, t0 + 1001).allowed).toBe(true);
  });

  it("un afflux de clés anonymes ne remet pas à zéro les compteurs des comptes connectés", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 2; i++) rateLimit("test-visits:alice", 2, 60_000, t0);
    expect(rateLimit("test-visits:alice", 2, 60_000, t0 + 1).allowed).toBe(false);
    for (let i = 0; i < 25_000; i++) rateLimit(`test-waitlist:ip-${i}`, 5, 60_000, t0 + 2);
    expect(rateLimit("test-visits:alice", 2, 60_000, t0 + 3).allowed).toBe(false);
  });

  it("dans un même espace, seules les clés les moins récentes sont évincées", () => {
    const t0 = 3_000_000;
    rateLimit("test-flood:victime", 1, 60_000, t0);
    for (let i = 0; i < 12_000; i++) {
      rateLimit(`test-flood:k-${i}`, 5, 60_000, t0 + 1);
      // La victime reste active : elle n'est jamais la plus ancienne.
      if (i % 1000 === 0) expect(rateLimit("test-flood:victime", 1, 60_000, t0 + 2).allowed).toBe(false);
    }
    expect(rateLimit("test-flood:victime", 1, 60_000, t0 + 3).allowed).toBe(false);
  });
});
