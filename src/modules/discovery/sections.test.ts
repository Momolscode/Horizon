import { describe, expect, it } from "vitest";
import { catalog } from "@/test/fixtures";
import { buildSections } from "./sections";

describe("sections Découvrir", () => {
  it("n'invente pas « Autour de vous » sans position", () => {
    const sections = buildSections({ catalog, destinationId: null, position: null, visitedIds: new Set(), friendRecommendations: [] });
    const around = sections.find((s) => s.id === "around")!;
    expect(around.items).toEqual([]);
    expect(around.unavailable).toMatch(/Localisez-vous/);
  });

  it("trie « Autour de vous » par distance et l'explique", () => {
    const sections = buildSections({ catalog, destinationId: null, position: { lat: 45.7625, lng: 4.8272 }, visitedIds: new Set(), friendRecommendations: [] });
    const around = sections.find((s) => s.id === "around")!;
    expect(around.items[0]!.place.destinationId).toBe("lyon");
    expect(around.items[0]!.reason).toMatch(/vol d'oiseau/);
  });

  it("« Gratuit » ne contient aucun coût inconnu", () => {
    const free = buildSections({ catalog, destinationId: "lyon", position: null, visitedIds: new Set(), friendRecommendations: [] }).find((s) => s.id === "free")!;
    expect(free.items.length).toBeGreaterThan(0);
    for (const item of free.items) expect(item.place.practical.price.status).not.toBe("unknown");
  });

  it("n'affiche les recommandations d'amis que si elles existent et signale les profils fictifs", () => {
    expect(buildSections({ catalog, destinationId: null, position: null, visitedIds: new Set(), friendRecommendations: [] }).some((s) => s.id === "friends")).toBe(false);
    const withFriends = buildSections({
      catalog,
      destinationId: null,
      position: null,
      visitedIds: new Set(),
      friendRecommendations: [{ placeId: "lyon-mur-des-canuts", friendName: "Camille", note: "Top", fictional: true }],
    });
    const friends = withFriends.find((s) => s.id === "friends")!;
    expect(friends.items[0]!.reason).toMatch(/profil fictif/);
  });

  it("met en avant les lieux non visités dans « ce week-end »", () => {
    const weekend = buildSections({ catalog, destinationId: "lyon", position: null, visitedIds: new Set(["lyon-mur-des-canuts"]), friendRecommendations: [] }).find((s) => s.id === "weekend")!;
    expect(weekend.items.some((i) => i.place.id === "lyon-mur-des-canuts")).toBe(false);
  });
});
