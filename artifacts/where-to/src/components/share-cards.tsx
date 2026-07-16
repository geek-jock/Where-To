import { useRef, useState, useEffect } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VerdictJson, GroupVerdictJson } from "@workspace/api-client-react";

const CARD_W = 1080;
const CARD_H = 1350;

const OFF_WHITE = "#FAF9F7";
const INK = "#1a1714";
const MUTED = "#9b8f80";
const ACCENT = "#b8854f";
const SOFT = "#4a4035";
const RULE = "#e8e4df";

const SERIF = "'Playfair Display', Georgia, serif";
const SANS = "'Inter', system-ui, sans-serif";

// ─── Travel Patterns Card ──────────────────────────────────────────────────

interface TravelPatternsCardProps {
  patterns: string[];
}

export function TravelPatternsCard({ patterns }: TravelPatternsCardProps) {
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: OFF_WHITE,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "120px 100px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 72 }}>
        <p
          style={{
            fontFamily: SANS,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: MUTED,
            margin: 0,
          }}
        >
          Your Travel Patterns
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
          {patterns.slice(0, 3).map((pattern, i) => (
            <div key={i} style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
              <span
                style={{
                  color: MUTED,
                  fontSize: 30,
                  lineHeight: 1,
                  marginTop: 8,
                  flexShrink: 0,
                  fontFamily: SERIF,
                }}
              >
                •
              </span>
              <p
                style={{
                  fontFamily: SERIF,
                  fontSize: 36,
                  lineHeight: 1.55,
                  color: INK,
                  fontStyle: "italic",
                  margin: 0,
                }}
              >
                {pattern}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p
        style={{
          fontFamily: SANS,
          fontSize: 15,
          color: MUTED,
          letterSpacing: "0.12em",
          margin: 0,
        }}
      >
        Where To
      </p>
    </div>
  );
}

// ─── Group Verdict Card ────────────────────────────────────────────────────

interface WhoGetsWhatItem {
  memberName: string;
  assignment: string;
}

interface GroupVerdictCardProps {
  question: string;
  verdict: string;
  whoGetsWhat: WhoGetsWhatItem[];
  theSeam: string;
}

export function GroupVerdictCard({ question, verdict, whoGetsWhat, theSeam }: GroupVerdictCardProps) {
  const shortQ = question.length > 72 ? question.slice(0, 69) + "…" : question;

  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: OFF_WHITE,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "100px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 56 }}>
        {/* The Question */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <p
            style={{
              fontFamily: SANS,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: MUTED,
              margin: 0,
            }}
          >
            The Question
          </p>
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 30,
              lineHeight: 1.5,
              color: SOFT,
              fontStyle: "italic",
              margin: 0,
            }}
          >
            {shortQ}
          </p>
        </div>

        {/* The Verdict */}
        <div
          style={{
            borderTop: `1px solid ${RULE}`,
            borderBottom: `1px solid ${RULE}`,
            padding: "48px 0",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <p
            style={{
              fontFamily: SANS,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: ACCENT,
              margin: 0,
            }}
          >
            The Verdict
          </p>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 54,
              lineHeight: 1.2,
              color: INK,
              fontWeight: 700,
              margin: 0,
            }}
          >
            {verdict}
          </h2>
        </div>

        {/* Who Gets What */}
        {whoGetsWhat.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <p
              style={{
                fontFamily: SANS,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: MUTED,
                margin: 0,
              }}
            >
              Who Gets What
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {whoGetsWhat.map((item, i) => (
                <p
                  key={i}
                  style={{
                    fontFamily: SERIF,
                    fontSize: 26,
                    color: INK,
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  <span style={{ color: MUTED }}>{item.memberName} — </span>
                  <span style={{ fontStyle: "italic" }}>{item.assignment}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* The Seam */}
        {theSeam && (
          <div style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: 32 }}>
            <p
              style={{
                fontFamily: SERIF,
                fontSize: 25,
                lineHeight: 1.75,
                color: SOFT,
                fontStyle: "italic",
                margin: 0,
              }}
            >
              {theSeam}
            </p>
          </div>
        )}
      </div>

      <p
        style={{
          fontFamily: SANS,
          fontSize: 15,
          color: MUTED,
          letterSpacing: "0.12em",
          margin: 0,
        }}
      >
        Where To
      </p>
    </div>
  );
}

// ─── Download utility ──────────────────────────────────────────────────────

async function downloadElementAsPng(element: HTMLElement, filename: string) {
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(element, {
    width: CARD_W,
    height: CARD_H,
    pixelRatio: 1,
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Travel Patterns Download Button ──────────────────────────────────────

interface TravelPatternsDownloadProps {
  verdictJson: VerdictJson;
}

export function TravelPatternsDownloadButton({ verdictJson }: TravelPatternsDownloadProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (!isGenerating || !cardRef.current || hasTriggered.current) return;
    hasTriggered.current = true;

    downloadElementAsPng(cardRef.current, "travel-patterns.png").finally(() => {
      setIsGenerating(false);
      hasTriggered.current = false;
    });
  }, [isGenerating]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsGenerating(true)}
        disabled={isGenerating}
      >
        <Download className="h-3.5 w-3.5" />
        {isGenerating ? "Generating…" : "Download card"}
      </Button>

      {isGenerating && (
        <div
          style={{
            position: "fixed",
            top: -9999,
            left: -9999,
            pointerEvents: "none",
            zIndex: -1,
          }}
          aria-hidden
        >
          <div ref={cardRef}>
            <TravelPatternsCard patterns={verdictJson.travelPatterns} />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Group Verdict Download Button ────────────────────────────────────────

interface GroupVerdictDownloadProps {
  question: string;
  verdictJson: GroupVerdictJson;
}

export function GroupVerdictDownloadButton({ question, verdictJson }: GroupVerdictDownloadProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (!isGenerating || !cardRef.current || hasTriggered.current) return;
    hasTriggered.current = true;

    downloadElementAsPng(cardRef.current, "group-verdict.png").finally(() => {
      setIsGenerating(false);
      hasTriggered.current = false;
    });
  }, [isGenerating]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsGenerating(true)}
        disabled={isGenerating}
      >
        <Download className="h-3.5 w-3.5" />
        {isGenerating ? "Generating…" : "Share verdict"}
      </Button>

      {isGenerating && (
        <div
          style={{
            position: "fixed",
            top: -9999,
            left: -9999,
            pointerEvents: "none",
            zIndex: -1,
          }}
          aria-hidden
        >
          <div ref={cardRef}>
            <GroupVerdictCard
              question={question}
              verdict={verdictJson.verdict}
              whoGetsWhat={verdictJson.whoGetsWhat}
              theSeam={verdictJson.theSeam}
            />
          </div>
        </div>
      )}
    </>
  );
}
