import { expect, type Page } from "@playwright/test";

/** Aucun débordement horizontal (exigence mobile). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (style.position === "fixed" || r.width === 0) return false;
        let parent = el.parentElement;
        while (parent) {
          const ps = getComputedStyle(parent);
          if (["auto", "scroll", "hidden", "clip"].includes(ps.overflowX)) return false;
          parent = parent.parentElement;
        }
        return r.right > window.innerWidth + 1;
      })
      .slice(0, 3)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`);
    return { scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth, offenders };
  });
  expect(overflow.scrollWidth, `débordement : ${overflow.offenders.join(", ")}`).toBeLessThanOrEqual(overflow.innerWidth);
}

export async function openApp(page: Page, path = "/carte") {
  await page.goto(path);
  await expect(page.getByText("DÉMONSTRATION", { exact: true })).toBeVisible();
}
