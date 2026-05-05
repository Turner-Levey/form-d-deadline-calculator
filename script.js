(function () {
  "use strict";

  const today = new Date();
  const form = document.querySelector("#deadline-form");
  const results = document.querySelector("#results");
  const output = document.querySelector("#memo-output");
  const fields = {
    issuer: document.querySelector("#issuer"),
    offering: document.querySelector("#offering"),
    firstSaleDate: document.querySelector("#first-sale-date"),
    actualFilingDate: document.querySelector("#actual-filing-date"),
    priorNoticeDate: document.querySelector("#prior-notice-date"),
    offeringStatus: document.querySelector("#offering-status"),
    edgarStatus: document.querySelector("#edgar-status"),
    exemptionPath: document.querySelector("#exemption-path"),
    closureDates: document.querySelector("#closure-dates"),
    stateNotes: document.querySelector("#state-notes"),
    nextStep: document.querySelector("#next-step")
  };

  const toIsoDate = (date) => date.toISOString().slice(0, 10);
  fields.firstSaleDate.value = toIsoDate(today);

  function getValue(key) {
    return fields[key].value.trim();
  }

  function parseIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addCalendarDays(date, days) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function addYears(date, years) {
    const next = new Date(date);
    next.setUTCFullYear(next.getUTCFullYear() + years);
    return next;
  }

  function observedDate(year, monthIndex, day) {
    const date = new Date(Date.UTC(year, monthIndex, day, 12));
    const weekday = date.getUTCDay();
    if (weekday === 0) return addCalendarDays(date, 1);
    if (weekday === 6) return addCalendarDays(date, -1);
    return date;
  }

  function nthWeekday(year, monthIndex, weekday, occurrence) {
    const first = new Date(Date.UTC(year, monthIndex, 1, 12));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, monthIndex, 1 + offset + (occurrence - 1) * 7, 12));
  }

  function lastWeekday(year, monthIndex, weekday) {
    const last = new Date(Date.UTC(year, monthIndex + 1, 0, 12));
    const offset = (last.getUTCDay() - weekday + 7) % 7;
    return addCalendarDays(last, -offset);
  }

  function standardFederalHolidaySet(year) {
    return new Set([
      observedDate(year, 0, 1),
      nthWeekday(year, 0, 1, 3),
      nthWeekday(year, 1, 1, 3),
      lastWeekday(year, 4, 1),
      observedDate(year, 5, 19),
      observedDate(year, 6, 4),
      nthWeekday(year, 8, 1, 1),
      nthWeekday(year, 9, 1, 2),
      observedDate(year, 10, 11),
      nthWeekday(year, 10, 4, 4),
      observedDate(year, 11, 25)
    ].map(toIsoDate));
  }

  function closureSetFor(anchorDate) {
    const years = [
      anchorDate.getUTCFullYear() - 1,
      anchorDate.getUTCFullYear(),
      anchorDate.getUTCFullYear() + 1
    ];
    const closures = new Set();
    years.forEach((year) => standardFederalHolidaySet(year).forEach((date) => closures.add(date)));
    getValue("closureDates")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
      .forEach((date) => closures.add(date));
    return closures;
  }

  function isBusinessDay(date, closures) {
    const day = date.getUTCDay();
    return day !== 0 && day !== 6 && !closures.has(toIsoDate(date));
  }

  function nextBusinessDay(date, closures) {
    let next = new Date(date);
    while (!isBusinessDay(next, closures)) {
      next = addCalendarDays(next, 1);
    }
    return next;
  }

  function priorBusinessDay(date, closures) {
    let next = new Date(date);
    while (!isBusinessDay(next, closures)) {
      next = addCalendarDays(next, -1);
    }
    return next;
  }

  function daysBetween(from, to) {
    const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.round((end - start) / 86400000);
  }

  function formatDate(date) {
    return date ? toIsoDate(date) : "not entered";
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function edgarAction(statusValue, dueDate) {
    if (statusValue === "CIK and EDGAR access confirmed") {
      return "EDGAR access is marked confirmed; gather issuer, offering, exemption, investor, signature, and amendment facts before opening the online form.";
    }
    if (statusValue === "CIK exists, access not confirmed") {
      return `Confirm EDGAR account access, Login.gov credentials, role authorization, and CCC before ${formatDate(dueDate)}.`;
    }
    if (statusValue === "No CIK or access yet") {
      return `Start Form ID / EDGAR access immediately; target completion before ${formatDate(dueDate)}.`;
    }
    return "Confirm EDGAR access status with the issuer, account administrator, filing agent, or counsel.";
  }

  function calculate() {
    const firstSaleDate = parseIsoDate(getValue("firstSaleDate"));
    if (!firstSaleDate) {
      throw new Error("Enter a valid first-sale date.");
    }
    const closures = closureSetFor(firstSaleDate);
    const rawDueDate = addCalendarDays(firstSaleDate, 15);
    const adjustedDueDate = nextBusinessDay(rawDueDate, closures);
    const actualFilingDate = parseIsoDate(getValue("actualFilingDate"));
    const priorNoticeDate = parseIsoDate(getValue("priorNoticeDate"));
    const todayDate = parseIsoDate(toIsoDate(today));
    const daysUntilDue = daysBetween(todayDate, adjustedDueDate);

    let statusLabel = "Open";
    if (actualFilingDate) {
      statusLabel = actualFilingDate <= adjustedDueDate ? "Filed by calculated target" : "Filed after calculated target";
    } else if (daysUntilDue < 0) {
      statusLabel = "Past calculated target";
    } else if (daysUntilDue <= 3) {
      statusLabel = "Urgent";
    } else if (daysUntilDue <= 7) {
      statusLabel = "Soon";
    }

    const annualBaseDate = priorNoticeDate || actualFilingDate;
    let annualDueDate = null;
    let annualPlanningDate = null;
    if (annualBaseDate && getValue("offeringStatus") !== "Closed") {
      annualDueDate = addYears(annualBaseDate, 1);
      annualPlanningDate = priorBusinessDay(annualDueDate, closures);
    }

    const warnings = [
      "This worksheet does not determine exemption eligibility, first-sale facts, state notice requirements, amendment requirements, or filing obligation."
    ];
    if (formatDate(rawDueDate) !== formatDate(adjustedDueDate)) {
      warnings.push("The raw 15-calendar-day date moved to the next business day because of weekend or closure handling.");
    }
    if (getValue("edgarStatus") !== "CIK and EDGAR access confirmed") {
      warnings.push("EDGAR access is not marked fully confirmed.");
    }
    if (getValue("stateNotes")) {
      warnings.push("State notice filing requirements must be verified separately.");
    }
    if (statusLabel.includes("Past") || statusLabel.includes("after")) {
      warnings.push("Review late-filing consequences and cure steps with counsel.");
    }
    if (getValue("offeringStatus") === "Unknown / verify") {
      warnings.push("Offering status is unknown; annual amendment need requires verification.");
    }

    return {
      issuer: getValue("issuer") || "Unnamed issuer",
      offering: getValue("offering") || "Unnamed offering",
      firstSaleDate,
      rawDueDate,
      adjustedDueDate,
      actualFilingDate,
      priorNoticeDate,
      annualDueDate,
      annualPlanningDate,
      statusLabel,
      daysUntilDue,
      edgarNote: edgarAction(getValue("edgarStatus"), adjustedDueDate),
      exemptionPath: getValue("exemptionPath"),
      offeringStatus: getValue("offeringStatus"),
      stateNotes: getValue("stateNotes") || "Verify separately.",
      nextStep: getValue("nextStep") || "Verify source facts with counsel.",
      warnings
    };
  }

  function renderResult(data) {
    const daysText = data.actualFilingDate
      ? `filed ${daysBetween(data.adjustedDueDate, data.actualFilingDate)} day(s) from target`
      : `${data.daysUntilDue} day(s) from today`;
    const annualText = data.annualDueDate
      ? `${formatDate(data.annualPlanningDate)} planning target`
      : "add prior notice date if ongoing";
    results.innerHTML = [
      `<div><span class="label">Status</span><strong>${data.statusLabel}</strong></div>`,
      `<div><span class="label">Form D target</span><strong>${formatDate(data.adjustedDueDate)}</strong><small>${daysText}</small></div>`,
      `<div><span class="label">Raw 15-day date</span><strong>${formatDate(data.rawDueDate)}</strong><small>${formatDate(data.rawDueDate) === formatDate(data.adjustedDueDate) ? "no move" : "moved forward"}</small></div>`,
      `<div><span class="label">Annual amendment</span><strong>${data.annualDueDate ? formatDate(data.annualDueDate) : "verify"}</strong><small>${annualText}</small></div>`
    ].join("");
  }

  function buildMemo(data) {
    return [
      "# Form D Deadline Planning Memo",
      "",
      `Issuer or fund: ${data.issuer}`,
      `Offering: ${data.offering}`,
      `Exemption label: ${data.exemptionPath}`,
      `First-sale date entered: ${formatDate(data.firstSaleDate)}`,
      `Calculated 15-calendar-day date: ${formatDate(data.rawDueDate)}`,
      `Calculated Form D target date: ${formatDate(data.adjustedDueDate)}`,
      `Actual filing date: ${formatDate(data.actualFilingDate)}`,
      `Current status: ${data.statusLabel}`,
      `EDGAR access note: ${data.edgarNote}`,
      `Offering status: ${data.offeringStatus}`,
      `Annual amendment anniversary: ${data.annualDueDate ? formatDate(data.annualDueDate) : "not calculated"}`,
      `Annual amendment planning target: ${data.annualPlanningDate ? formatDate(data.annualPlanningDate) : "not calculated"}`,
      `State notice note: ${data.stateNotes}`,
      `Next verification step: ${data.nextStep}`,
      "",
      "Warnings:",
      ...data.warnings.map((warning) => `- ${warning}`),
      "",
      "Source notes: SEC guidance says a Form D notice is filed for Regulation D offerings, companies must file within 15 days after the first sale, the first-sale date is when the first investor is irrevocably contractually committed to invest, and weekend or holiday due dates move to the next business day. SEC guidance also notes Form D and amendments are filed online through EDGAR and that annual amendments may be required if an offering continues beyond 12 months or certain information changes.",
      "",
      "Official sources:",
      "- https://www.sec.gov/resources-small-businesses/capital-raising-building-blocks/what-form-d",
      "- https://www.sec.gov/resources-small-businesses/exempt-offerings/filing-form-d-notice",
      "- https://www.sec.gov/submit-filings/forms-index/form-d",
      "",
      "Disclosure: informational planning worksheet only; not legal advice, securities advice, an EDGAR filing service, or an official SEC tool."
    ].join("\n");
  }

  function buildCsv(data) {
    const headers = [
      "issuer",
      "offering",
      "exemption_label",
      "first_sale_date",
      "raw_15_day_date",
      "calculated_form_d_target",
      "actual_filing_date",
      "status",
      "edgar_note",
      "offering_status",
      "annual_amendment_anniversary",
      "annual_planning_target",
      "state_notice_note",
      "next_step"
    ];
    const row = [
      data.issuer,
      data.offering,
      data.exemptionPath,
      formatDate(data.firstSaleDate),
      formatDate(data.rawDueDate),
      formatDate(data.adjustedDueDate),
      formatDate(data.actualFilingDate),
      data.statusLabel,
      data.edgarNote,
      data.offeringStatus,
      formatDate(data.annualDueDate),
      formatDate(data.annualPlanningDate),
      data.stateNotes,
      data.nextStep
    ];
    return `${headers.join(",")}\n${row.map(csvEscape).join(",")}\n`;
  }

  function setButtonCopied(button) {
    const original = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  }

  async function copyText(text, button) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      output.focus();
      output.select();
      document.execCommand("copy");
    }
    setButtonCopied(button);
  }

  function runCalculation() {
    try {
      const data = calculate();
      renderResult(data);
      output.value = buildMemo(data);
      return data;
    } catch (error) {
      results.innerHTML = `<div><span class="label">Input needed</span><strong>${error.message}</strong></div>`;
      output.value = "";
      throw error;
    }
  }

  function safeRunCalculation() {
    try {
      runCalculation();
    } catch {
      // The result band already shows the input issue.
    }
  }

  form.addEventListener("input", safeRunCalculation);
  form.addEventListener("change", safeRunCalculation);
  document.querySelector("#calculate").addEventListener("click", safeRunCalculation);
  document.querySelector("#copy-memo").addEventListener("click", (event) => {
    const data = output.value.trim() ? calculate() : runCalculation();
    copyText(output.value || buildMemo(data), event.currentTarget).catch(() => {});
  });
  document.querySelector("#copy-csv").addEventListener("click", (event) => {
    copyText(buildCsv(calculate()), event.currentTarget).catch(() => {});
  });
  document.querySelector("#download-csv").addEventListener("click", () => {
    const blob = new Blob([buildCsv(calculate())], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "form-d-deadline.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  runCalculation();
}());
