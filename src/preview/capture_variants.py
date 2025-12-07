#!/usr/bin/env python3
"""Capture screenshots of each design variant."""

from playwright.sync_api import sync_playwright
import os

OUTPUT_DIR = "/tmp/arete-design-preview"
os.makedirs(OUTPUT_DIR, exist_ok=True)

variants = ["current", "serif", "atmospheric", "combined"]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    page.goto("http://localhost:3000")
    page.wait_for_load_state("networkidle")

    for variant in variants:
        # Click the variant button
        button_text = {
            "current": "Current",
            "serif": "A: Serif",
            "atmospheric": "C: Atmospheric",
            "combined": "A+C Combined"
        }[variant]

        page.click(f"button:has-text('{button_text}')")
        page.wait_for_timeout(300)  # Wait for transition

        # Take full page screenshot
        screenshot_path = f"{OUTPUT_DIR}/{variant}.png"
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Captured: {screenshot_path}")

    browser.close()
    print(f"\nAll screenshots saved to {OUTPUT_DIR}")
