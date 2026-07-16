import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import type { VerdictJson } from "@workspace/api-client-react";
import { VerdictDisplay } from "./verdict-display";

type ParsedSection = { label: string; lines: string[] };

function parseResult(result: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const raw of result.split("\n")) {
    const line = raw.trim();
    if (!line || line === "---") continue;

    const isHeader =
      line.endsWith(":") &&
      line.length < 80 &&
      !line.startsWith("-") &&
      !line.startsWith("*") &&
      !/^\d+\./.test(line);

    const inlineMatch = !line.startsWith("-") && !line.startsWith("*") && !/^\d+\./.test(line)
      ? line.match(/^([A-Z][^:]{3,60}):\s+(.+)$/)
      : null;

    if (isHeader) {
      current = { label: line.slice(0, -1), lines: [] };
      sections.push(current);
    } else if (inlineMatch && !current) {
      const [, label, content] = inlineMatch;
      const sec: ParsedSection = { label, lines: [content] };
      sections.push(sec);
      current = sec;
    } else {
      if (!current) {
        current = { label: "", lines: [] };
        sections.push(current);
      }
      current.lines.push(line);
    }
  }

  return sections.filter(s => s.lines.length > 0 || s.label);
}

function isList(lines: string[]) {
  return lines.some(l => /^[-*•]/.test(l) || /^\d+\./.test(l));
}

function ListItem({ text }: { text: string }) {
  const clean = text.replace(/^[-*•\d.]\s*/, "").trim();
  return (
    <li className="flex gap-2.5 text-foreground">
      <span className="text-primary mt-1 flex-shrink-0 text-base leading-none">•</span>
      <span className="leading-relaxed">{clean}</span>
    </li>
  );
}

function SectionBody({ lines }: { lines: string[] }) {
  if (isList(lines)) {
    return (
      <ul className="space-y-2">
        {lines.map((l, i) => <ListItem key={i} text={l} />)}
      </ul>
    );
  }
  return (
    <p className="text-foreground leading-relaxed">
      {lines.join(" ")}
    </p>
  );
}

const ACTION_LABELS = new Set([
  "Your Next Move (do this today)",
  "Your Next Move",
  "Start Here — 3 Anchors",
  "Start Here",
  "Timing Confidence",
  "Stop Doing This",
  "If you want, I can turn this into a 3-day structure or map",
]);

const VERDICT_LABELS = new Set([
  "Your Best Trip Direction",
  "The Verdict",
  "Best Trip Direction",
]);

const SKIP_LABELS = new Set([
  "If you want, I can turn this into a 3-day structure or map",
]);

interface DecisionResultProps {
  question: string;
  result: string;
  resultJson?: VerdictJson | null;
  createdAt?: string;
  backHref?: string;
  onNewDecision?: () => void;
  savesMap?: Record<number, string>;
}

export function DecisionResult({ question, result, resultJson, createdAt, backHref, onNewDecision, savesMap }: DecisionResultProps) {
  if (resultJson) {
    return (
      <VerdictDisplay
        question={question}
        verdictJson={resultJson}
        createdAt={createdAt}
        backHref={backHref}
        onNewDecision={onNewDecision}
        savesMap={savesMap}
      />
    );
  }

  const sections = parseResult(result);
  const verdictSection = sections.find(s => VERDICT_LABELS.has(s.label));
  const bodySections = sections.filter(s => !VERDICT_LABELS.has(s.label) && !ACTION_LABELS.has(s.label) && !SKIP_LABELS.has(s.label));
  const actionSections = sections.filter(s => ACTION_LABELS.has(s.label) && !SKIP_LABELS.has(s.label));

  return (
    <div className="space-y-12 max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500 pb-28">

      {backHref && (
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to history
        </Link>
      )}

      <div className="space-y-3">
        <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">The Question</p>
        <p className="text-xl font-serif italic text-foreground border-l-2 border-primary pl-5 leading-snug">
          {question}
        </p>
        {createdAt && (
          <p className="text-xs text-muted-foreground pl-5">
            {format(new Date(createdAt), "MMMM d, yyyy")}
          </p>
        )}
      </div>

      {verdictSection && verdictSection.lines.length > 0 && (
        <div className="py-8 border-t border-b border-border space-y-3">
          <p className="text-xs font-semibold tracking-widest uppercase text-primary">The Verdict</p>
          <h2 className="text-4xl md:text-5xl font-serif text-foreground leading-tight">
            {verdictSection.lines.join(" ")}
          </h2>
        </div>
      )}

      {bodySections.length > 0 && (
        <div className="space-y-10">
          {bodySections.map((sec, i) => (
            <div key={i} className="space-y-3">
              {sec.label && (
                <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">
                  {sec.label}
                </p>
              )}
              <SectionBody lines={sec.lines} />
            </div>
          ))}
        </div>
      )}

      {actionSections.length > 0 && (
        <div className="bg-card border border-border p-6 md:p-8 space-y-7">
          <p className="text-xs font-semibold tracking-widest uppercase text-primary">Action Plan</p>
          {actionSections.map((sec, i) => (
            <div key={i} className="space-y-2">
              {sec.label && (
                <p className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  {sec.label}
                </p>
              )}
              {sec.label === "Stop Doing This" ? (
                <p className="text-foreground leading-relaxed border-l-2 border-destructive/40 pl-4">
                  {sec.lines.join(" ")}
                </p>
              ) : isList(sec.lines) ? (
                <ul className="space-y-2">
                  {sec.lines.map((l, j) => <ListItem key={j} text={l} />)}
                </ul>
              ) : (
                <p className={`leading-relaxed ${i === 0 ? "text-lg font-serif text-foreground" : "text-foreground"}`}>
                  {sec.lines.join(" ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {(backHref || onNewDecision) && (
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          {backHref && (
            <Button variant="outline" asChild>
              <Link href="/history">View all decisions</Link>
            </Button>
          )}
          {onNewDecision && (
            <Button variant="outline" onClick={onNewDecision}>
              Ask something else
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
