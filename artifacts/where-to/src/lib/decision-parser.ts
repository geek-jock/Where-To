export function parseDecision(result: string) {
  // Simple markdown section parser
  // Looks for headers and groups content under them
  const sections = {
    patterns: "",
    direction: "",
    tradeoffs: "",
    timing: "",
    action: {
      nextMove: "",
      anchors: [] as string[],
      timingConfidence: "",
      stopDoingThis: "",
      hook: ""
    }
  };

  const lines = result.split('\n');
  let currentSection = "";
  let actionSubSection = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect main sections
    if (line.includes("Your Travel Patterns")) {
      currentSection = "patterns";
      continue;
    } else if (line.includes("Your Best Trip Direction") || line.includes("The Verdict")) {
      currentSection = "direction";
      continue;
    } else if (line.includes("Tradeoffs") || line.includes("The Trade-offs")) {
      currentSection = "tradeoffs";
      continue;
    } else if (line.includes("Best Time To Go") || line.includes("When To Go")) {
      currentSection = "timing";
      continue;
    } else if (line.includes("Action Block") || line.includes("Your Next Move")) {
      currentSection = "action";
      actionSubSection = "nextMove";
      if (line.includes("Your Next Move") && line.split(':').length > 1) {
        sections.action.nextMove += line.split(':').slice(1).join(':').trim() + "\n";
      }
      continue;
    }

    // Parse Action block subsections
    if (currentSection === "action") {
      if (line.includes("Next Move:")) {
        actionSubSection = "nextMove";
        sections.action.nextMove += line.replace("Next Move:", "").trim() + "\n";
        continue;
      } else if (line.includes("Anchors:")) {
        actionSubSection = "anchors";
        continue;
      } else if (line.includes("Timing Confidence:")) {
        actionSubSection = "timingConfidence";
        sections.action.timingConfidence += line.replace("Timing Confidence:", "").trim() + "\n";
        continue;
      } else if (line.includes("Stop Doing This:")) {
        actionSubSection = "stopDoingThis";
        sections.action.stopDoingThis += line.replace("Stop Doing This:", "").trim() + "\n";
        continue;
      } else if (line.includes("If you want, I can")) {
        actionSubSection = "hook";
        sections.action.hook += line + "\n";
        continue;
      }

      if (actionSubSection === "nextMove") sections.action.nextMove += line + "\n";
      else if (actionSubSection === "anchors") {
        if (line.startsWith("-") || line.startsWith("*")) {
          sections.action.anchors.push(line.replace(/^[-*]\s*/, ""));
        } else {
          sections.action.anchors.push(line);
        }
      }
      else if (actionSubSection === "timingConfidence") sections.action.timingConfidence += line + "\n";
      else if (actionSubSection === "stopDoingThis") sections.action.stopDoingThis += line + "\n";
      else if (actionSubSection === "hook") sections.action.hook += line + "\n";
      
      continue;
    }

    // Default section appending
    if (currentSection === "patterns") sections.patterns += line + "\n";
    else if (currentSection === "direction") sections.direction += line + "\n";
    else if (currentSection === "tradeoffs") sections.tradeoffs += line + "\n";
    else if (currentSection === "timing") sections.timing += line + "\n";
    else if (currentSection === "") {
      // If no section found yet, just shove it somewhere
      sections.direction += line + "\n";
    }
  }

  // Cleanup
  return {
    patterns: sections.patterns.trim(),
    direction: sections.direction.trim(),
    tradeoffs: sections.tradeoffs.trim(),
    timing: sections.timing.trim(),
    action: {
      nextMove: sections.action.nextMove.trim(),
      anchors: sections.action.anchors,
      timingConfidence: sections.action.timingConfidence.trim(),
      stopDoingThis: sections.action.stopDoingThis.trim(),
      hook: sections.action.hook.trim() || "If you want, I can turn this into a 3-day structure or map."
    }
  };
}
