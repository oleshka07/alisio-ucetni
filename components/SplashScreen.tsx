"use client";

import { useState, useEffect } from "react";

export default function SplashScreen() {
  // Заставка — лише раз за сесію браузера і не на сторінці входу/посиланнях з Telegram
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem("alisio_splash") === "1";
      sessionStorage.setItem("alisio_splash", "1");
    } catch {
      seen = true;
    }
    if (seen || window.location.pathname !== "/dashboard") return;
    setVisible(true);
    const timer = setTimeout(() => setFadeOut(true), 2500);
    const removeTimer = setTimeout(() => setVisible(false), 3300);
    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  // Generate node positions for the network visualization
  const nodes = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: 10 + Math.random() * 80,
    y: 10 + Math.random() * 80,
    size: 3 + Math.random() * 5,
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 2,
    isHuman: i < 30,
  }));

  // Generate connections between nodes
  const connections: Array<{ x1: number; y1: number; x2: number; y2: number; delay: number }> = [];
  for (let i = 0; i < 50; i++) {
    const a = nodes[Math.floor(Math.random() * nodes.length)];
    const b = nodes[Math.floor(Math.random() * nodes.length)];
    if (a.id !== b.id) {
      const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      if (dist < 35) {
        connections.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, delay: Math.random() * 4 });
      }
    }
  }

  // Floating particles
  const particles = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 1 + Math.random() * 2,
    delay: Math.random() * 5,
    duration: 3 + Math.random() * 4,
  }));

  return (
    <div
      onClick={() => setVisible(false)}
      className={`splash-overlay ${fadeOut ? "splash-fade-out" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "linear-gradient(135deg, #0a0a1a 0%, #1a1040 40%, #0d1530 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* Background grid */}
      <div className="splash-grid" />

      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={`p-${p.id}`}
          className="splash-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}

      {/* Network SVG */}
      <svg
        viewBox="0 0 100 100"
        className="splash-network"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Connections */}
        {connections.map((c, i) => (
          <line
            key={`c-${i}`}
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            className="splash-connection"
            style={{ animationDelay: `${c.delay}s` }}
          />
        ))}

        {/* Nodes */}
        {nodes.map((n) => (
          <g key={`n-${n.id}`}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.size / 4}
              className={n.isHuman ? "splash-node-human" : "splash-node-doc"}
              style={{
                animationDelay: `${n.delay}s`,
                animationDuration: `${n.duration}s`,
              }}
            />
            {/* Pulse ring for some nodes */}
            {n.id % 5 === 0 && (
              <circle
                cx={n.x}
                cy={n.y}
                r={n.size / 4}
                className="splash-pulse-ring"
                style={{ animationDelay: `${n.delay + 0.5}s` }}
              />
            )}
          </g>
        ))}

        {/* Central AI hub */}
        <circle cx="50" cy="50" r="3" className="splash-ai-core" />
        <circle cx="50" cy="50" r="5" className="splash-ai-ring-1" />
        <circle cx="50" cy="50" r="8" className="splash-ai-ring-2" />
        <circle cx="50" cy="50" r="12" className="splash-ai-ring-3" />

        {/* Orbiting dots around AI core */}
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <circle
            key={`orb-${i}`}
            cx="50"
            cy="50"
            r="0.8"
            className="splash-orbit-dot"
            style={{
              transformOrigin: "50px 50px",
              animationDelay: `${i * 0.3}s`,
              // @ts-expect-error CSS custom property
              "--orbit-radius": `${6 + i * 1.2}px`,
              "--orbit-angle-start": `${angle}deg`,
            }}
          />
        ))}

        {/* Data flow lines to center */}
        {nodes.filter((_, i) => i % 4 === 0).map((n, i) => (
          <line
            key={`flow-${i}`}
            x1={n.x}
            y1={n.y}
            x2="50"
            y2="50"
            className="splash-data-flow"
            style={{ animationDelay: `${1 + i * 0.4}s` }}
          />
        ))}
      </svg>

      {/* Content overlay */}
      <div className="splash-content">
        {/* AI Icon */}
        <div className="splash-ai-icon">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <path
              d="M28 8L8 20v16l20 12 20-12V20L28 8z"
              stroke="url(#grad1)"
              strokeWidth="1.5"
              fill="none"
              className="splash-hex-path"
            />
            <path
              d="M28 16L16 23v14l12 7 12-7V23l-12-7z"
              stroke="url(#grad1)"
              strokeWidth="1"
              fill="none"
              className="splash-hex-path-inner"
            />
            <circle cx="28" cy="28" r="4" fill="url(#grad1)" className="splash-center-dot" />
            {/* Neural connections inside */}
            {[
              [28, 24, 22, 28],
              [28, 24, 34, 28],
              [22, 28, 28, 32],
              [34, 28, 28, 32],
              [28, 24, 28, 17],
              [22, 28, 16, 28],
              [34, 28, 40, 28],
              [28, 32, 28, 39],
            ].map(([x1, y1, x2, y2], i) => (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(139,92,246,0.5)"
                strokeWidth="0.8"
                className="splash-neural-line"
                style={{ animationDelay: `${0.5 + i * 0.15}s` }}
              />
            ))}
            <defs>
              <linearGradient id="grad1" x1="0" y1="0" x2="56" y2="56">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <h1 className="splash-title">ALISIO</h1>
        <p className="splash-subtitle">AI-Powered Accounting</p>

        {/* Animated taglines */}
        <div className="splash-taglines">
          <span className="splash-tagline splash-tagline-1">Analyzujeme data</span>
          <span className="splash-tagline splash-tagline-2">Propojujeme lidi</span>
          <span className="splash-tagline splash-tagline-3">Automatizujeme procesy</span>
        </div>

        {/* Stats counter */}
        <div className="splash-stats">
          <div className="splash-stat">
            <span className="splash-stat-num">
              <AnimatedCounter target={1247} duration={4000} />
            </span>
            <span className="splash-stat-label">Zpracovaných dokumentů</span>
          </div>
          <div className="splash-stat-divider" />
          <div className="splash-stat">
            <span className="splash-stat-num">
              <AnimatedCounter target={342} duration={3500} />
            </span>
            <span className="splash-stat-label">Spokojených klientů</span>
          </div>
          <div className="splash-stat-divider" />
          <div className="splash-stat">
            <span className="splash-stat-num">
              <AnimatedCounter target={98} duration={3000} suffix="%" />
            </span>
            <span className="splash-stat-label">Úspora času</span>
          </div>
        </div>

        {/* Loading bar */}
        <div className="splash-loader">
          <div className="splash-loader-bar" />
        </div>
      </div>
    </div>
  );
}

function AnimatedCounter({
  target,
  duration,
  suffix = "",
}: {
  target: number;
  duration: number;
  suffix?: string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [target, duration]);

  return (
    <>
      {count.toLocaleString()}
      {suffix}
    </>
  );
}
