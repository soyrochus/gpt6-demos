// SPDX-License-Identifier: GPL-2.0-or-later
import { chromium } from "playwright";

export function launchChrome({ headless, args = [] }) {
  // Headless Chrome on Linux also needs --enable-gpu to use the desktop GPU.
  const graphics = process.platform === "linux"
    ? ["--enable-features=Vulkan", ...(headless ? ["--enable-gpu"] : [])]
    : [];
  return chromium.launch({
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : { channel: "chrome" }),
    headless,
    args: [...graphics, ...args],
  });
}
