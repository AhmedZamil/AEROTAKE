"use client";

import { useEffect, useRef } from "react";

type Turnstile = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

/**
 * Cloudflare Turnstile, the quiet CAPTCHA: it checks the browser in the background and only shows a tick-box when it is unsure, so most
 * people never notice it. Renders nothing when the site has no site key (local development). The token it produces is single-use, so
 * `resetKey` (change it after every submit) asks for a fresh one.
 */
export default function Captcha({ siteKey, onToken, resetKey = 0 }: { siteKey: string | null | undefined; onToken: (token: string | null) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !window.turnstile || !box.current || widget.current) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        appearance: "interaction-only", // invisible unless a visible step is needed
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(null),
        "error-callback": () => onToken(null),
      });
    };
    if (window.turnstile) mount();
    else {
      let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", mount);
    }
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      onToken(null);
      window.turnstile.reset(widget.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return siteKey ? <div ref={box} className="flex justify-center" /> : null;
}
