import { describe, expect, it } from "vitest";
import { rejectCrossSite } from "./request-guard";

const req = (headers: Record<string, string>, method = "POST") => new Request("http://localhost:3000/api/visits", { method, headers });

describe("garde CSRF", () => {
  it("accepte une requête même origine en JSON", () => {
    expect(rejectCrossSite(req({ origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json", "sec-fetch-site": "same-origin" }))).toBeNull();
  });
  it("refuse une origine différente, un site tiers ou un corps non JSON", () => {
    expect(rejectCrossSite(req({ origin: "https://evil.example", host: "localhost:3000", "content-type": "application/json" }))?.status).toBe(403);
    expect(rejectCrossSite(req({ "sec-fetch-site": "same-site", host: "localhost:3000", "content-type": "application/json" }))?.status).toBe(403);
    expect(rejectCrossSite(req({ host: "localhost:3000", "content-type": "text/plain" }))?.status).toBe(415);
  });
  it("n'exige pas de corps JSON pour DELETE", () => {
    expect(rejectCrossSite(req({ origin: "http://localhost:3000", host: "localhost:3000" }, "DELETE"))).toBeNull();
  });
});
