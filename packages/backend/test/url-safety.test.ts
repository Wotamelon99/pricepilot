import { describe, expect, it } from "vitest";
import { isSafeRedirectUrl } from "../src/lib/url-safety.js";

describe("isSafeRedirectUrl", () => {
  it("allows ordinary https URLs", () => {
    expect(isSafeRedirectUrl("https://www.amazon.de/dp/B0TEST")).toBe(true);
  });

  it("allows ordinary http URLs", () => {
    expect(isSafeRedirectUrl("http://shop.example.com/product/1")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isSafeRedirectUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: URLs", () => {
    expect(isSafeRedirectUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects file: URLs", () => {
    expect(isSafeRedirectUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects localhost targets", () => {
    expect(isSafeRedirectUrl("http://localhost:8080/admin")).toBe(false);
  });

  it("rejects private/internal IP ranges", () => {
    expect(isSafeRedirectUrl("http://127.0.0.1/")).toBe(false);
    expect(isSafeRedirectUrl("http://10.0.0.5/")).toBe(false);
    expect(isSafeRedirectUrl("http://192.168.1.1/")).toBe(false);
    expect(isSafeRedirectUrl("http://169.254.169.254/")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeRedirectUrl("not a url")).toBe(false);
  });
});
