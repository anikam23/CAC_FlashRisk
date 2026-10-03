"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type LandingPageProps = {
  onEnter: () => void;
};

const EXIT_MS = 380;

export function LandingPage({ onEnter }: LandingPageProps) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function enter() {
    if (leaving) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      onEnter();
      return;
    }
    setLeaving(true);
    timer.current = window.setTimeout(onEnter, EXIT_MS);
  }

  return (
    <section className={leaving ? "landing-hero is-leaving" : "landing-hero"} aria-label="FlashRisk">
      <div className="landing-hero__stage" aria-hidden>
        <div className="landing-hero__arrive">
          <div className="landing-hero__drift">
            <Image
              src="/FlashRisk-lp-4k.png"
              alt=""
              fill
              priority
              unoptimized
              sizes="100vw"
              className="landing-hero__image"
            />
          </div>
        </div>
        <div className="landing-hero__glow-wrap">
          <div className="landing-hero__glow" />
        </div>
        <div className="landing-hero__fade" />
      </div>

      <div className="landing-copy">
        <p className="landing-kicker">California Lightning Ignition Surveillance</p>
        <h1 className="landing-title" aria-label="FlashRisk">
          <span className="landing-title__flash">Flash</span><span className="landing-title__risk">Risk</span>
        </h1>
        <p className="landing-lede">
          Lightning ignition surveillance powered by satellite observations and environmental data.
        </p>
        <div className="landing-enter-wrap">
          <Button type="button" className="landing-enter" onClick={enter}>
            Enter FlashRisk
            <span className="landing-enter__arrow" aria-hidden>
              →
            </span>
          </Button>
        </div>
      </div>
    </section>
  );
}
