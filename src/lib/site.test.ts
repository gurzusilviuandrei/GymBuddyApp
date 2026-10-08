import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The public pages in site/ (privacy policy, account deletion, email-link landing page).
// Google Play needs the first two at public addresses, so they must not rot unnoticed.
const SITE = join(process.cwd(), "site");
const pages = readdirSync(SITE).filter((f) => f.endsWith(".html"));

const addressToFile = (href: string): string | null => {
  const path = href.split("#")[0]!.split("?")[0]!;
  if (path === "/" || path === "") return "index.html";
  if (!path.startsWith("/")) return null;
  const name = path.slice(1);
  return /\.[a-z0-9]+$/i.test(name) ? name : `${name}.html`;
};

describe("the website in site/", () => {
  it("has the pages Google Play and the email links need", () => {
    for (const f of ["index.html", "privacy.html", "delete-account.html", "open.html", "open.js", "style.css", "favicon.png"]) {
      expect(existsSync(join(SITE, f)), f).toBe(true);
    }
  });

  it("every internal link and asset points at a file that exists", () => {
    for (const page of pages) {
      const html = readFileSync(join(SITE, page), "utf8");
      for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const target = m[1]!;
        if (/^(https?:|mailto:|app\.gymbuddyapp\.gymbuddy:)/.test(target)) continue;
        const file = addressToFile(target);
        expect(file, `${page} -> ${target}`).not.toBeNull();
        expect(existsSync(join(SITE, file!)), `${page} -> ${target}`).toBe(true);
      }
    }
  });

  it("every page has a language, a title, a viewport and no external scripts", () => {
    for (const page of pages) {
      const html = readFileSync(join(SITE, page), "utf8");
      expect(html, page).toMatch(/<html lang="en">/);
      expect(html, page).toMatch(/<title>[^<]{3,}<\/title>/);
      expect(html, page).toMatch(/name="viewport"/);
      expect(html, page).not.toMatch(/<script[^>]+src="https?:/);
    }
  });

  it("the policy and deletion pages name the real in-app steps", () => {
    const privacy = readFileSync(join(SITE, "privacy.html"), "utf8");
    const del = readFileSync(join(SITE, "delete-account.html"), "utf8");
    expect(del).toMatch(/Delete Account/);
    expect(del).toMatch(/Profile/);
    expect(privacy).toMatch(/Sentry/);
    expect(privacy).toMatch(/Supabase/);
    expect(privacy).toMatch(/MailerSend/);
  });

  it("the landing page hands the code to the app's own address", () => {
    const js = readFileSync(join(SITE, "open.js"), "utf8");
    expect(js).toContain("app.gymbuddyapp.gymbuddy://auth-callback/");
    expect(js).toContain("location.search");
  });
});
