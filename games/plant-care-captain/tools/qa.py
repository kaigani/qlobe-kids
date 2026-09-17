#!/usr/bin/env python3
"""Playwright smoke + screenshot suite for local and deployed builds."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright


ROOT = Path(__file__).resolve().parents[3]
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")


def parser() -> argparse.ArgumentParser:
    cli = argparse.ArgumentParser(description="Smoke-test Plant Care Captain")
    cli.add_argument("--base-url", default="http://127.0.0.1:4173")
    cli.add_argument("--out", default=str(ROOT / "artifacts" / "plant-care-captain-qa"))
    return cli


def ready(page: Page) -> None:
    page.wait_for_function("() => window.QLOBE_DEBUG && window.QLOBE_DEBUG.version === 1")
    page.evaluate("() => window.QLOBE_DEBUG.ready")
    page.wait_for_timeout(120)


def shot(page: Page, output: Path, name: str) -> None:
    page.screenshot(path=str(output / f"{name}.png"), full_page=True)


def visual_health(page: Page) -> dict:
    return page.evaluate(
        """() => ({
          viewport: [innerWidth, innerHeight],
          scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
          brokenImages: [...document.images].filter(img => !img.complete || img.naturalWidth < 2)
            .map(img => img.getAttribute('src')),
          targets: window.QLOBE_DEBUG.getTargets(),
          state: window.QLOBE_DEBUG.getState(),
        })"""
    )


def assert_visual_health(health: dict, label: str) -> None:
    width, height = health["viewport"]
    scroll_width, scroll_height = health["scroll"]
    assert not health["brokenImages"], f"{label}: broken images {health['brokenImages']}"
    assert scroll_width <= width + 1, f"{label}: horizontal overflow {scroll_width}>{width}"
    assert scroll_height <= height + 1, f"{label}: vertical overflow {scroll_height}>{height}"
    assert health["targets"], f"{label}: no debug targets"


def drag(page: Page, source: str, target: str) -> None:
    start = page.locator(source).bounding_box()
    end = page.locator(target).bounding_box()
    assert start and end, f"missing drag endpoint {source} -> {target}"
    page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
    page.mouse.down()
    page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2, steps=12)
    page.mouse.up()
    page.wait_for_timeout(220)


def drag_to_point(page: Page, source: str, x: float, y: float) -> None:
    start = page.locator(source).bounding_box()
    assert start, f"missing drag source {source}"
    page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
    page.mouse.down()
    page.mouse.move(x, y, steps=12)
    page.mouse.up()
    page.wait_for_timeout(180)


def wait_action_settled(page: Page) -> None:
    page.wait_for_function("() => !window.QLOBE_DEBUG.getState().actionBusy")


def assert_contact(page: Page, kind: str, target: str) -> None:
    result = page.evaluate(
        """([kind, target]) => {
          const tool = document.querySelector(`.contact-tool.contact-${kind}`);
          const destination = document.querySelector(target);
          if (!tool || !destination) return { ok: false, reason: 'missing endpoint' };
          const a = tool.getBoundingClientRect();
          const b = destination.getBoundingClientRect();
          const overlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          return {
            ok: tool.complete && tool.naturalWidth > 1 && overlap > 400,
            overlap,
            tool: [a.x, a.y, a.width, a.height],
            target: [b.x, b.y, b.width, b.height],
          };
        }""",
        [kind, target],
    )
    assert result["ok"], f"{kind} contact did not visibly overlap {target}: {result}"
    state = page.evaluate("() => window.QLOBE_DEBUG.getState()")
    assert state["actionBusy"] is True and state["contact"]["kind"] == kind


def target_bounds(page: Page, selectors: dict[str, str], label: str) -> dict:
    measurements = page.evaluate(
        """(selectors) => Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
          const el = document.querySelector(selector);
          if (!el) return [name, null];
          const rect = el.getBoundingClientRect();
          const pseudo = getComputedStyle(el, '::before');
          const pseudoWidth = Number.parseFloat(pseudo.width) || 0;
          const pseudoHeight = Number.parseFloat(pseudo.height) || 0;
          return [name, {
            width: rect.width,
            height: rect.height,
            hitWidth: Math.max(rect.width, pseudoWidth),
            hitHeight: Math.max(rect.height, pseudoHeight),
          }];
        }))""",
        selectors,
    )
    for name, bounds in measurements.items():
        assert bounds, f"{label}: missing target {name}"
        assert bounds["hitWidth"] >= 95.5, f"{label}: {name} hit width {bounds['hitWidth']}"
        assert bounds["hitHeight"] >= 95.5, f"{label}: {name} hit height {bounds['hitHeight']}"
    return {"label": label, "targets": measurements}


def attach_diagnostics(page: Page, errors: list[str]) -> None:
    page.on("console", lambda message: errors.append(f"console:{message.type}:{message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror:{error}"))
    page.on("requestfailed", lambda request: errors.append(f"requestfailed:{request.url}:{request.failure}"))


def visit(context: BrowserContext, url: str, errors: list[str]) -> Page:
    page = context.new_page()
    attach_diagnostics(page, errors)
    response = page.goto(url, wait_until="networkidle")
    assert response and response.ok, f"navigation failed: {response.status if response else 'no response'}"
    ready(page)
    return page


def landscape_flow(
    browser: Browser, url: str, output: Path, errors: list[str], bounds_log: list[dict]
) -> list[dict]:
    context = browser.new_context(viewport={"width": 1180, "height": 520})
    page = visit(context, url, errors)
    records: list[dict] = []
    shot(page, output, "01-select-landscape")
    records.append(visual_health(page))
    bounds_log.append(target_bounds(page, {
        "plant-choice": '[data-target="plant-sunflower"]',
        "home-hud": '[data-target="home"]',
        "sound-hud": '[data-target="sound"]',
    }, "landscape select"))

    page.locator('[data-target="plant-sunflower"]').click()
    page.wait_for_timeout(320)
    shot(page, output, "02-water-intro-landscape")
    bounds_log.append(target_bounds(page, {
        "intro-cta": '[data-target="start-water"]',
        "back-hud": '[data-target="back"]',
        "sound-hud": '[data-target="sound"]',
    }, "landscape intro"))
    log = page.evaluate("() => window.QLOBE_DEBUG.getAudioLog()")
    assert any(entry.get("key") == "chosen" and entry.get("kind") == "clip" for entry in log), "recorded chosen clip did not start"
    page.evaluate("() => window.QLOBE_DEBUG.mute(true)")

    page.locator('[data-target="start-water"]').click()
    # Invalid drop must recover the lifted tool instead of leaving it stuck.
    drag_to_point(page, '[data-target="tool-water"]', 1174, 6)
    assert page.locator('[data-target="tool-water"].is-lifted').count() == 0
    assert page.evaluate("() => window.QLOBE_DEBUG.getState().progress.water") == 0
    drag(page, '[data-target="tool-water"]', '[data-target="water-target"]')
    assert page.evaluate("() => window.QLOBE_DEBUG.getState().progress.water") == 1
    assert_contact(page, "water", '[data-target="water-target"]')
    assert page.locator('.progress-mark.mark-water').count() == 1
    shot(page, output, "03-water-contact-landscape")
    bounds_log.append(target_bounds(page, {
        "care-tool": '[data-target="tool-water"]',
        "back-hud": '[data-target="back"]',
        "sound-hud": '[data-target="sound"]',
    }, "landscape water"))
    wait_action_settled(page)
    page.locator('[data-target="tool-water"]').click()
    wait_action_settled(page)
    page.locator('[data-target="tool-water"]').click()
    page.wait_for_function("() => window.QLOBE_DEBUG.getState().screen === 'intro'")
    assert page.evaluate("() => window.QLOBE_DEBUG.getState().tool") == "mist"
    shot(page, output, "04-water-done-mist-intro-landscape")

    page.locator('[data-target="start-mist"]').click()
    page.locator('[data-target="tool-mist"]').click()
    page.wait_for_timeout(240)
    assert_contact(page, "mist", '[data-target="mist-target"]')
    assert page.locator('.progress-mark.mark-mist').count() == 1
    shot(page, output, "05-mist-contact-landscape")
    wait_action_settled(page)
    page.locator('[data-target="tool-mist"]').click()
    wait_action_settled(page)
    page.locator('[data-target="tool-mist"]').click()
    page.wait_for_function("() => window.QLOBE_DEBUG.getState().tool === 'prune'")
    shot(page, output, "06-mist-done-prune-intro-landscape")

    page.locator('[data-target="start-prune"]').click()
    drag(page, '[data-target="tool-prune"]', '[data-target="dry-leaf-0"]')
    assert_contact(page, "prune", '[data-target="dry-leaf-0"]')
    assert page.locator('[data-target="dry-leaf-0"].is-snipping').count() == 1
    assert page.locator('.progress-mark.mark-prune').count() == 1
    bounds_log.append(target_bounds(page, {
        "prune-tool": '[data-target="tool-prune"]',
        "dry-leaf-0": '[data-target="dry-leaf-0"]',
        "dry-leaf-1": '[data-target="dry-leaf-1"]',
        "dry-leaf-2": '[data-target="dry-leaf-2"]',
    }, "landscape prune"))
    page.wait_for_timeout(180)
    shot(page, output, "07-prune-contact-landscape")
    wait_action_settled(page)
    page.wait_for_timeout(280)
    assert page.locator('.falling-leaf.leaf-0').count() == 1
    shot(page, output, "07b-prune-fall-landscape")
    page.wait_for_function("() => window.QLOBE_DEBUG.getState().fallingLeaf === null")
    drag(page, '[data-target="tool-prune"]', '[data-target="dry-leaf-1"]')
    wait_action_settled(page)
    page.wait_for_function("() => window.QLOBE_DEBUG.getState().fallingLeaf === null")
    prune_state = page.evaluate("() => window.QLOBE_DEBUG.getState()")
    assert prune_state["progress"]["prune"] == 2, prune_state
    assert page.locator('[data-target="dry-leaf-2"]').count() == 1, prune_state
    drag(page, '[data-target="tool-prune"]', '[data-target="dry-leaf-2"]')
    state = page.evaluate("() => window.QLOBE_DEBUG.getState()")
    assert state["inputLocked"] is True and state["actionBusy"] is True
    page.wait_for_function("() => window.QLOBE_DEBUG.getState().screen === 'thriving'")
    page.wait_for_timeout(900)
    shot(page, output, "08-thriving-landscape")
    final = visual_health(page)
    assert final["state"]["completedTools"] == ["water", "mist", "prune"]
    assert final["state"]["plantState"] == "bloom"
    records.append(final)

    page.locator('[data-target="next-plant"]').click()
    page.wait_for_function("() => window.QLOBE_DEBUG.getState().screen === 'select'")
    assert page.locator('.plant-choice.is-complete').count() == 1
    records.append(visual_health(page))
    context.close()
    return records


def portrait_flow(
    browser: Browser, url: str, output: Path, errors: list[str], bounds_log: list[dict]
) -> list[dict]:
    context = browser.new_context(viewport={"width": 768, "height": 1024})
    page = visit(context, url, errors)
    page.evaluate("() => window.QLOBE_DEBUG.mute(true)")
    shot(page, output, "09-select-portrait")
    first = visual_health(page)
    assert_visual_health(first, "portrait select")
    page.locator('[data-target="plant-pea"]').click()
    page.locator('[data-target="start-water"]').click()
    drag(page, '[data-target="tool-water"]', '[data-target="water-target"]')
    assert_contact(page, "water", '[data-target="water-target"]')
    shot(page, output, "10a-water-contact-portrait")
    middle = visual_health(page)
    assert_visual_health(middle, "portrait water")
    plant_box = page.locator('.care-plant').bounding_box()
    assert plant_box and 0.36 * 768 <= plant_box["width"] <= 0.50 * 768, plant_box
    bounds_log.append(target_bounds(page, {
        "care-tool": '[data-target="tool-water"]',
        "back-hud": '[data-target="back"]',
        "sound-hud": '[data-target="sound"]',
    }, "portrait water"))
    wait_action_settled(page)
    page.evaluate("() => window.QLOBE_DEBUG.completeTool()")
    page.evaluate("() => window.QLOBE_DEBUG.completeTool()")
    page.locator('[data-target="start-prune"]').click()
    drag(page, '[data-target="tool-prune"]', '[data-target="dry-leaf-1"]')
    assert_contact(page, "prune", '[data-target="dry-leaf-1"]')
    bounds_log.append(target_bounds(page, {
        "prune-tool": '[data-target="tool-prune"]',
        "dry-leaf": '[data-target="dry-leaf-1"]',
    }, "portrait prune"))
    page.wait_for_timeout(180)
    shot(page, output, "10b-prune-contact-portrait")
    page.evaluate("() => window.QLOBE_DEBUG.win()")
    page.wait_for_timeout(900)
    shot(page, output, "11-thriving-portrait")
    final = visual_health(page)
    assert_visual_health(final, "portrait thriving")
    context.close()
    return [first, middle, final]


def phone_smoke(
    browser: Browser, url: str, output: Path, errors: list[str], bounds_log: list[dict]
) -> dict:
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = visit(context, url, errors)
    page.evaluate("() => window.QLOBE_DEBUG.mute(true)")
    page.locator('[data-target="plant-basil"]').click()
    page.locator('[data-target="start-water"]').click()
    page.locator('[data-target="tool-water"]').click()
    page.wait_for_timeout(240)
    assert_contact(page, "water", '[data-target="water-target"]')
    shot(page, output, "14-water-contact-phone")
    health = visual_health(page)
    assert_visual_health(health, "390x844 phone")
    bounds_log.append(target_bounds(page, {
        "care-tool": '[data-target="tool-water"]',
        "back-hud": '[data-target="back"]',
        "sound-hud": '[data-target="sound"]',
    }, "390x844 phone"))
    context.close()
    return health


def reduced_flow(browser: Browser, url: str, output: Path, errors: list[str]) -> dict:
    context = browser.new_context(viewport={"width": 1180, "height": 520}, reduced_motion="reduce")
    page = visit(context, url, errors)
    page.evaluate("() => window.QLOBE_DEBUG.mute(true)")
    page.locator('[data-target="plant-basil"]').click()
    page.locator('[data-target="start-water"]').click()
    page.locator('[data-target="tool-water"]').click()
    page.wait_for_timeout(120)
    assert_contact(page, "water", '[data-target="water-target"]')
    animation = page.locator('.contact-tool').evaluate("el => getComputedStyle(el).animationName")
    assert animation == "none", f"reduced-motion contact still animates: {animation}"
    shot(page, output, "12-water-contact-reduced-motion")
    health = visual_health(page)
    assert health["state"]["reducedMotion"] is True
    assert_visual_health(health, "reduced-motion contact")
    page.evaluate("() => window.QLOBE_DEBUG.win()")
    page.wait_for_timeout(120)
    shot(page, output, "13-thriving-reduced-motion")
    context.close()
    return health


def hub_shelf(browser: Browser, base_url: str, output: Path, errors: list[str]) -> dict:
    context = browser.new_context(viewport={"width": 1180, "height": 820})
    page = context.new_page()
    attach_diagnostics(page, errors)
    response = page.goto(base_url.rstrip("/") + "/#practical-life", wait_until="networkidle")
    assert response and response.ok, "hub navigation failed"
    card = page.locator('[data-game-id="plant-care-captain"]')
    card.wait_for(state="visible")
    card.scroll_into_view_if_needed()
    page.wait_for_timeout(240)
    image_health = card.locator('img').evaluate(
        "img => ({ complete: img.complete, width: img.naturalWidth, height: img.naturalHeight })"
    )
    assert image_health["complete"] and image_health["width"] > 1, image_health
    shot(page, output, "15-hub-practical-life-shelf")
    result = {"hubTile": image_health, "card": card.bounding_box()}
    context.close()
    return result


def main() -> None:
    args = parser().parse_args()
    output = Path(args.out).resolve()
    output.mkdir(parents=True, exist_ok=True)
    url = args.base_url.rstrip("/") + "/games/plant-care-captain/"
    executable = CHROME if CHROME.exists() else EDGE
    assert executable.exists(), "Chrome or Edge is required"
    errors: list[str] = []
    bounds_log: list[dict] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(executable),
            headless=True,
            args=["--mute-audio", "--disable-gpu"],
        )
        records = landscape_flow(browser, url, output, errors, bounds_log)
        records.extend(portrait_flow(browser, url, output, errors, bounds_log))
        records.append(phone_smoke(browser, url, output, errors, bounds_log))
        records.append(reduced_flow(browser, url, output, errors))
        hub = hub_shelf(browser, args.base_url, output, errors)
        browser.close()
    real_errors = [
        entry for entry in errors
        if "favicon" not in entry and "google-analytics.com" not in entry
    ]
    report = {
        "url": url,
        "screenshots": sorted(path.name for path in output.glob("*.png")),
        "checks": len(records),
        "targetBounds": bounds_log,
        "hub": hub,
        "errors": real_errors,
    }
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    assert not real_errors, "browser errors: " + " | ".join(real_errors)


if __name__ == "__main__":
    main()
