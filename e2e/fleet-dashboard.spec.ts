import { expect, test } from "@playwright/test"

test.describe("Fleet Dashboard", () => {
  test("fleet overview shows agent cards", async ({ page }) => {
    await page.goto("/agent/fleet")
    // Wait for agent cards to load (links to agent detail pages)
    const cards = page.locator("a[href*='/agent/fleet/']")
    await expect(cards).not.toHaveCount(0)
    // Check for Beki and Besa
    await expect(page.getByText("beki")).toBeVisible()
    await expect(page.getByText("besa")).toBeVisible()
  })

  test("agent cards show health status", async ({ page }) => {
    await page.goto("/agent/fleet")
    // Health text should be visible (healthy, elevated, degraded, or unknown)
    const healthLabels = page.locator(
      "text=/healthy|elevated|degraded|unknown/i",
    )
    await expect(healthLabels.first()).toBeVisible()
  })

  test("agent detail page loads without error", async ({ page }) => {
    await page.goto("/agent/fleet")
    // Click first agent card
    const firstCard = page.locator("a[href*='/agent/fleet/']").first()
    await firstCard.click()
    // Should be on agent detail page
    await expect(page).toHaveURL(/\/agent\/fleet\/\w+/)
  })

  test("main agent nav has Fleet link", async ({ page }) => {
    await page.goto("/agent")
    const fleetLink = page.locator("a[href='/agent/fleet']")
    await expect(fleetLink).toBeVisible()
    await expect(fleetLink).toHaveText("Fleet")
  })
})
