import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface DonationReportSummary {
  weeklyQuota: number;
  paidThisWeek: number;
  paidToDate: number;
  poolCarryIn: number;
  gap: number;
  completion: number;
  eligible: number;
  owing: number;
}

export interface DonationReportArmy {
  name: string;
  memberCount: number;
  eligible: number;
  quota: number;
  paid: number;
  poolCarryIn: number;
  unpaid: number;
}

export interface DonationReportMember {
  username: string;
  armyName: string;
  level: number;
  wealth: number;
  donationClass: "eco" | "fighter";
  dailyTarget: number;
  weeklyTarget: number;
  days: Array<{ amount: number; state: string }>;
  weeklyPaid: number;
  surplus: number;
  unpaid: number;
  status: string;
}

export interface DonationReportInput {
  weekStart: string;
  dates: string[];
  generatedAt: Date;
  paymentViewLabel: string;
  filterLabel: string;
  ruleLabel: string;
  summary: DonationReportSummary;
  armies: DonationReportArmy[];
  members: DonationReportMember[];
}

function cleanPdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ç/g, "c").replace(/Ç/g, "C")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/[—–]/g, "-")
    .replace(/·/g, "|");
}

function number(value: number): string {
  return Math.round(Number(value) || 0).toLocaleString("tr-TR");
}

function gold(value: number): string {
  return `${number(value)} G`;
}

function formatDate(date: string): string {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
}

function statusShort(state: string): string {
  const labels: Record<string, string> = {
    ok: "TAMAM",
    covered: "DEVIR",
    partial: "KISMI",
    missed: "EKSIK",
    today: "BUGUN",
    future: "BEKLIYOR",
    pre: "ONCESI",
    free: "MUAF",
    extra: "GONULLU",
  };
  return labels[state] || cleanPdfText(state).toUpperCase();
}

function drawHeader(doc: jsPDF, period: string, view: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(24, 35, 41);
  doc.rect(0, 0, pageWidth, 24, "F");
  doc.setFillColor(52, 211, 153);
  doc.rect(0, 23, pageWidth, 1.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("HAFTALIK BAGIS TAKIP RAPORU", 10, 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(187, 225, 250);
  doc.text(`${period}  |  Odeme gorunumu: ${cleanPdfText(view)}`, 10, 18);
}

function drawSummaryCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  detail: string,
) {
  doc.setFillColor(245, 250, 248);
  doc.setDrawColor(209, 226, 220);
  doc.roundedRect(x, y, width, 18, 2, 2, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(85, 105, 99);
  doc.text(cleanPdfText(label).toUpperCase(), x + 3, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 83, 45);
  doc.text(cleanPdfText(value), x + 3, y + 11.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(cleanPdfText(detail), x + 3, y + 15.5);
}

export function generateDonationTrackingPdf(input: DonationReportInput) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const period = `${formatDate(input.dates[0] || input.weekStart)} - ${formatDate(input.dates.at(-1) || input.weekStart)}`;
  drawHeader(doc, period, input.paymentViewLabel);

  const margin = 10;
  const gap = 3;
  const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
  const cards = [
    { label: "Haftalik hedef", value: gold(input.summary.weeklyQuota), detail: `${input.summary.eligible} yukumluluk` },
    { label: "Bu haftaki bagis", value: gold(input.summary.paidThisWeek), detail: `Bugune kadar ${gold(input.summary.paidToDate)}` },
    { label: "Kota acigi", value: gold(input.summary.gap), detail: `${input.summary.owing} uye eksik odemede` },
    { label: "Tamamlanma", value: `%${Math.round(input.summary.completion)}`, detail: `Devir ${gold(input.summary.poolCarryIn)}` },
  ];
  cards.forEach((card, index) => drawSummaryCard(doc, margin + index * (cardWidth + gap), 28, cardWidth, card.label, card.value, card.detail));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(90, 105, 115);
  doc.text(cleanPdfText(`Filtre: ${input.filterLabel}  |  Kurallar: ${input.ruleLabel}`), margin, 50);
  doc.text("Gunluk tutarlar secili odeme gorunumune gore; kota acigi tum bagis hedeflerine gore hesaplanmistir.", margin, 54);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 83, 45);
  doc.text("BIRLIK BAZINDA HAFTALIK DURUM", margin, 62);
  autoTable(doc, {
    startY: 64,
    margin: { top: 28, bottom: 12, left: margin, right: margin },
    head: [["Birlik", "Uye", "Yukumluluk", "Haftalik hedef", "Devir", "Havuz (devir dahil)", "Kota acigi"]],
    body: input.armies.map((army) => [
      cleanPdfText(army.name),
      number(army.memberCount),
      number(army.eligible),
      gold(army.quota),
      gold(army.poolCarryIn),
      gold(army.paid),
      gold(army.unpaid),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 2, textColor: [30, 41, 59], overflow: "linebreak" },
    headStyles: { fillColor: [24, 35, 41], textColor: [167, 243, 208], fontStyle: "bold", fontSize: 6.5 },
    alternateRowStyles: { fillColor: [245, 250, 248] },
    columnStyles: {
      0: { cellWidth: 68, fontStyle: "bold" },
      1: { cellWidth: 19, halign: "right" },
      2: { cellWidth: 25, halign: "right" },
      3: { cellWidth: 38, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
      5: { cellWidth: 48, halign: "right" },
      6: { cellWidth: 38, halign: "right" },
    },
    willDrawPage: () => drawHeader(doc, period, input.paymentViewLabel),
  });

  const armyFinalY = Number((doc as any).lastAutoTable?.finalY || 64);
  let memberHeadingY = armyFinalY + 8;
  if (memberHeadingY > pageHeight - 38) {
    doc.addPage();
    drawHeader(doc, period, input.paymentViewLabel);
    memberHeadingY = 32;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 83, 45);
  doc.text(`UYELERIN GUNLUK BAGIS DURUMU (${input.members.length} kayit)`, margin, memberHeadingY);

  const dayHeaders = input.dates.map((date, index) => {
    const weekday = ["PZT", "SAL", "CAR", "PER", "CUM", "CMT", "PAZ"][index] || "GUN";
    return `${weekday}\n${date.slice(8, 10)}.${date.slice(5, 7)}`;
  });
  const memberBody = input.members.map((member) => [
    `${cleanPdfText(member.username)}\n${cleanPdfText(member.armyName)}`,
    number(member.level),
    member.donationClass === "eco" ? "EKONOMI" : "SAVAS",
    number(member.wealth),
    gold(member.dailyTarget),
    ...input.dates.map((_, index) => {
      const day = member.days[index];
      if (!day) return "-";
      const amount = Math.round(day.amount) > 0 ? number(day.amount) : "-";
      return `${amount}\n${statusShort(day.state)}`;
    }),
    gold(member.weeklyPaid),
    gold(member.surplus),
    gold(member.unpaid),
    cleanPdfText(member.status),
  ]);
  const totalDaily = input.dates.map((_, index) => input.members.reduce((sum, member) => sum + (member.days[index]?.amount || 0), 0));
  const foot = [[
    "TOPLAM",
    "",
    "",
    "",
    gold(input.members.reduce((sum, member) => sum + member.weeklyTarget, 0)),
    ...totalDaily.map(gold),
    gold(input.members.reduce((sum, member) => sum + member.weeklyPaid, 0)),
    gold(input.members.reduce((sum, member) => sum + member.surplus, 0)),
    gold(input.members.reduce((sum, member) => sum + member.unpaid, 0)),
    `${input.members.length} uye`,
  ]];

  autoTable(doc, {
    startY: memberHeadingY + 3,
    margin: { top: 28, bottom: 12, left: margin, right: margin },
    head: [["Uye / Birlik", "Sv", "Sinif", "Servet", "Gunluk hedef", ...dayHeaders, "Odenen", "Fazla", "Kota acigi*", "Durum"]],
    body: memberBody,
    foot,
    showFoot: "lastPage",
    theme: "grid",
    styles: { font: "helvetica", fontSize: 5.5, cellPadding: 1.4, textColor: [30, 41, 59], overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [24, 35, 41], textColor: [167, 243, 208], fontStyle: "bold", fontSize: 5.5, halign: "center" },
    footStyles: { fillColor: [220, 252, 231], textColor: [20, 83, 45], fontStyle: "bold", fontSize: 5.5 },
    alternateRowStyles: { fillColor: [245, 250, 248] },
    columnStyles: {
      0: { cellWidth: 49, fontStyle: "bold" },
      1: { cellWidth: 8, halign: "center" },
      2: { cellWidth: 17, halign: "center" },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 16, halign: "right" },
      ...Object.fromEntries(input.dates.map((_, index) => [5 + index, { cellWidth: 13, halign: "center" }])),
      [5 + input.dates.length]: { cellWidth: 18, halign: "right" },
      [6 + input.dates.length]: { cellWidth: 16, halign: "right" },
      [7 + input.dates.length]: { cellWidth: 20, halign: "right" },
      [8 + input.dates.length]: { cellWidth: 24 },
    },
    willDrawPage: () => drawHeader(doc, period, input.paymentViewLabel),
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120, 135, 140);
    doc.text(
      cleanPdfText(`Rapor: ${input.generatedAt.toLocaleString("tr-TR")} | *Kota acigi tum bagis kaynaklarina gore hesaplanir. | Sayfa ${page}/${pageCount}`),
      margin,
      pageHeight - 5,
    );
  }

  doc.setProperties({
    title: `WarEra Haftalik Bagis Raporu ${period}`,
    subject: "Haftalik bagis kotasi, birlik durumu ve uye bazinda gunluk bagislar",
    author: "TurkEra Takip Paneli",
  });
  doc.save(`WarEra_Haftalik_Bagis_Raporu_${input.weekStart}.pdf`);
}
