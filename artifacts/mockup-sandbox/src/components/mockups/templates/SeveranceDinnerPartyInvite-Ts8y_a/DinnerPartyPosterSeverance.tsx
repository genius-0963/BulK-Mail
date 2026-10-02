import dinner from "./assets/dinner-cartoon2.png";
import React from "react";

/**
 * The Dinner Party — corporate-retro poster in the Severance / Lumon aesthetic.
 * Cold mint greens, institutional cream, precise hairline rules, mid-century
 * corporate typography, and unsettlingly polite HR copy.
 */

const CREAM = "#eef0e9";
const MINT = "#cfdcd2";
const DEEP = "#123529";
const PINE = "#1d4a38";
const INKY = "#0c241b";

const MONO = "'IBM Plex Mono', 'Courier New', monospace";
const SERIF = "'Marcellus', 'Times New Roman', serif";

function Rule({ w = "100%" }: { w?: number | string }) {
  return <div style={{ width: w, height: 1, background: DEEP, opacity: 0.55 }} />;
}

export default function DinnerPartyPosterSeverance() {
  return (
    <div
      className="relative flex flex-col items-center overflow-hidden"
      style={{ width: "100%", minHeight: 1200, background: CREAM, color: DEEP, fontFamily: SERIF }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Marcellus&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      {/* subtle ceiling-grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(${MINT} 1px, transparent 1px), linear-gradient(90deg, ${MINT} 1px, transparent 1px)`,
          backgroundSize: "80px 80px",
          opacity: 0.5,
        }}
      />

      {/* frame border */}
      <div className="absolute" style={{ inset: 22, border: `1px solid ${DEEP}`, pointerEvents: "none" }} />
      <div className="absolute" style={{ inset: 28, border: `1px solid ${DEEP}`, opacity: 0.35, pointerEvents: "none" }} />

      <div className="relative flex flex-col items-center w-full px-16 pt-16 pb-14" style={{ maxWidth: 800 }}>
        {/* department heading */}
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 6, textTransform: "uppercase", color: PINE }}>
          Macrodata Refinement · Social Division
        </div>
        <div className="mt-3 mb-6" style={{ width: 220 }}>
          <Rule />
        </div>

        {/* title */}
        <h1
          className="text-center"
          style={{ fontSize: 84, lineHeight: 0.98, letterSpacing: 2, color: INKY, fontWeight: 400 }}
        >
          THE DINNER
          <br />
          PARTY
        </h1>

        <div className="mt-5 text-center" style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 3, color: PINE }}>
          A REVOLVING EVENING OF EQUAL COURSES
        </div>

        {/* image plate — duotone office */}
        <div className="mt-9 relative" style={{ border: `1px solid ${DEEP}`, padding: 10, background: "#fff" }}>
          <div className="relative overflow-hidden" style={{ width: 560, height: 340 }}>
            <img
              src={dinner}
              alt="An illustrated dinner table, prepared with unsettling symmetry"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{ boxShadow: "inset 0 0 60px rgba(12,36,27,0.25)" }}
            />
          </div>
          <div
            className="text-center mt-2"
            style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: PINE, textTransform: "uppercase" }}
          >
            fig. 1 — the table has been prepared for you
          </div>
        </div>

        {/* details */}
        <div className="mt-9 w-full grid grid-cols-3 text-center" style={{ fontFamily: MONO }}>
          {[
            ["DATE", "SAT · AUG 08"],
            ["ARRIVAL", "7:00 PM SHARP"],
            ["FLOOR", "THE SEVERED DINING ROOM"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col items-center gap-2 px-2">
              <span style={{ fontSize: 10, letterSpacing: 4, color: PINE }}>{k}</span>
              <span style={{ fontSize: 14, letterSpacing: 1, color: INKY, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 w-full">
          <Rule />
        </div>

        {/* polite corporate copy */}
        <p
          className="mt-6 text-center"
          style={{ fontSize: 17, lineHeight: 1.7, color: PINE, maxWidth: 520 }}
        >
          Please enjoy each course equally. Guests are kindly reminded that the
          menu is mysterious and important. A music &amp; dance experience may be
          sanctioned, pending conduct.
        </p>

        {/* perks strip */}
        <div
          className="mt-7 flex items-center gap-8 px-8 py-3"
          style={{ background: DEEP, color: MINT, fontFamily: MONO, fontSize: 11, letterSpacing: 3 }}
        >
          <span>WINE PRIVILEGES</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>MELON BAR</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>FINGER TRAPS</span>
        </div>

        {/* RSVP */}
        <div className="mt-8 flex flex-col items-center gap-2" style={{ fontFamily: MONO }}>
          <span style={{ fontSize: 12, letterSpacing: 3, color: INKY, fontWeight: 600 }}>
            RSVP TO YOUR DEPARTMENT CHIEF BY AUG 01
          </span>
          <span style={{ fontSize: 10, letterSpacing: 2, color: PINE }}>
            attendance will be remembered · non-attendance will also be remembered
          </span>
        </div>
      </div>
    </div>
  );
}
