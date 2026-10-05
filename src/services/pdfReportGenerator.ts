import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface DayDamageRecord {
  date: string;
  formattedDate: string;
  damage: number;
}

export interface MemberHistoryReportItem {
  userId: string;
  username: string;
  level: number;
  militaryRank: number;
  role: string;
  day1Damage: number; // 2 days ago
  day2Damage: number; // Yesterday
  day3Damage: number; // Today
  total3DayDamage: number;
  currentHealth?: string;
}

export interface ArmyReportMeta {
  muName: string;
  muId: string;
  leaderUsername?: string;
  memberCount: number;
  totalDamage: number;
  dateStr: string;
  reportType: "singleDay" | "threeDaysConsolidated";
}

function formatDmg(value: number): string {
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + "B";
  }
  if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + "M";
  }
  if (value >= 1_000) {
    return (value / 1_000).toFixed(1) + "K";
  }
  return value.toLocaleString("tr-TR");
}

/**
 * Generate a PDF report for a single specific day (e.g. Today, Yesterday, or 2 days ago)
 */
export function generateSingleDayPdf(
  meta: ArmyReportMeta,
  members: Array<{
    username: string;
    level: number;
    role: string;
    damage: number;
    healthStr?: string;
    pillStatus?: string;
  }>,
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Background header band (Dark tactical navy)
  doc.setFillColor(24, 35, 41);
  doc.rect(0, 0, 210, 40, "F");

  // Accent line (Rose)
  doc.setFillColor(244, 63, 94);
  doc.rect(0, 39, 210, 1.5, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("WAR ERA - GUNLUK ORDU HASAR RAPORU", 14, 15);

  // Subtitle
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(187, 225, 250);
  doc.text(`Askeri Birlik: ${meta.muName} | Tarih: ${meta.dateStr}`, 14, 23);

  // Total summary badge
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `Toplam Hasar: ${formatDmg(meta.totalDamage)} DMG  |  Toplam Asker: ${meta.memberCount}`,
    14,
    31,
  );

  // Table rows
  const sorted = [...members].sort((a, b) => b.damage - a.damage);
  const tableData = sorted.map((m, idx) => [
    (idx + 1).toString(),
    m.username,
    `Lv.${m.level}`,
    m.role === "leader"
      ? "Lider"
      : m.role === "commander"
        ? "Komutan"
        : m.role === "manager"
          ? "Yonetici"
          : "Asker",
    formatDmg(m.damage),
    m.healthStr || "-",
    m.pillStatus === "buff"
      ? "Buff %60"
      : m.pillStatus === "debuff"
        ? "Debuff"
        : "Hazir",
  ]);

  autoTable(doc, {
    startY: 46,
    head: [
      ["#", "Asker Adı", "Seviye", "Gorev", "Gunluk Hasar", "Can (HP)", "Pill"],
    ],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [28, 40, 48],
      textColor: [244, 63, 94],
      fontStyle: "bold",
      fontSize: 9,
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 48, fontStyle: "bold" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 24, halign: "center" },
      4: { cellWidth: 32, halign: "right", fontStyle: "bold" },
      5: { cellWidth: 26, halign: "center" },
      6: { cellWidth: 22, halign: "center" },
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `War Era Telemetri Sistemi - 02:55 TSI Snapshot Guvencesi | Sayfa ${i} / ${pageCount}`,
      14,
      290,
    );
  }

  // Trigger browser download
  const cleanMuName = meta.muName.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `WarEra_Hasar_Raporu_${cleanMuName}_${meta.dateStr}.pdf`;
  doc.save(filename);
}

/**
 * Generate a Consolidated 3-Day History PDF Report showing damage progression for each day and 3-day total
 */
export function generateThreeDaysConsolidatedPdf(
  meta: ArmyReportMeta,
  dates: [string, string, string], // [Day 1 (oldest), Day 2, Day 3 (latest/today)]
  items: MemberHistoryReportItem[],
) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  // Header band
  doc.setFillColor(24, 35, 41);
  doc.rect(0, 0, 297, 38, "F");

  // Accent bar
  doc.setFillColor(244, 63, 94);
  doc.rect(0, 37, 297, 1.5, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(
    "WAR ERA - SON 3 GUNLUK KONSOLIDE HASAR & PERFORMANS RAPORU",
    14,
    14,
  );

  // Subtitle
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(187, 225, 250);
  doc.text(
    `Birlik: ${meta.muName} | Tarih Aralığı: ${dates[0]} - ${dates[2]} (02:55 TSİ Döngüsü)`,
    14,
    22,
  );

  const totalAll3Days = items.reduce((sum, it) => sum + it.total3DayDamage, 0);
  const avgDaily = Math.round(totalAll3Days / 3);

  doc.text(
    `3 Günlük Toplam Hasar: ${formatDmg(totalAll3Days)} DMG  |  Günlük Ortalama: ${formatDmg(avgDaily)} DMG  |  Toplam Asker: ${meta.memberCount}`,
    14,
    30,
  );

  // Table setup
  const sorted = [...items].sort(
    (a, b) => b.total3DayDamage - a.total3DayDamage,
  );

  const tableData = sorted.map((m, idx) => [
    (idx + 1).toString(),
    m.username,
    `Lv.${m.level}`,
    m.role === "leader"
      ? "Lider"
      : m.role === "commander"
        ? "Komutan"
        : m.role === "manager"
          ? "Yönetici"
          : "Asker",
    formatDmg(m.day1Damage),
    formatDmg(m.day2Damage),
    formatDmg(m.day3Damage),
    formatDmg(m.total3DayDamage),
  ]);

  autoTable(doc, {
    startY: 44,
    head: [
      [
        "#",
        "Asker Adı",
        "Seviye",
        "Görev",
        `1. Gün (${dates[0]})`,
        `2. Gün (${dates[1]})`,
        `3. Gün (${dates[2]})`,
        "3 Günlük Toplam Hasar",
      ],
    ],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [28, 40, 48],
      textColor: [244, 63, 94],
      fontStyle: "bold",
      fontSize: 9,
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 55, fontStyle: "bold" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 24, halign: "center" },
      4: { cellWidth: 42, halign: "right" },
      5: { cellWidth: 42, halign: "right" },
      6: { cellWidth: 42, halign: "right" },
      7: {
        cellWidth: 45,
        halign: "right",
        fontStyle: "bold",
        textColor: [190, 18, 60],
      },
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `War Era Telemetri Sistemi - 02:55 TSİ Snapshot ve Supabase Kalıcı Veri Tabanı Kaydı | Sayfa ${i} / ${pageCount}`,
      14,
      200,
    );
  }

  const cleanMuName = meta.muName.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `WarEra_3Gunluk_Hasar_Raporu_${cleanMuName}_${dates[0]}_${dates[2]}.pdf`;
  doc.save(filename);
}

export interface AllArmiesPdfItem {
  rank: number;
  muId: string;
  name: string;
  memberCount: number;
  todayDamage: number;
  weeklyDamage: number;
  avgDamagePerMember: number;
  topStriker: {
    username: string;
    damage: number;
    weeklyDamage: number;
  };
}

/**
 * Generate a consolidated PDF ranking report of all 8 Turkish armies for today
 */
export function generateAllArmiesTodayPdf(
  armies: AllArmiesPdfItem[],
  dateStr: string,
  baselineDateStr: string = "02:55 TSİ",
) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const totalTodayDamage = armies.reduce((s, a) => s + a.todayDamage, 0);
  const totalWeeklyDamage = armies.reduce((s, a) => s + a.weeklyDamage, 0);
  const totalSoldiers = armies.reduce((s, a) => s + a.memberCount, 0);
  const topArmy = armies[0] || { name: "-", todayDamage: 0 };

  // Find top striker across all armies
  let overallTopStriker = { username: "-", damage: 0, armyName: "-" };
  armies.forEach((a) => {
    if (a.topStriker && a.topStriker.damage > overallTopStriker.damage) {
      overallTopStriker = {
        username: a.topStriker.username,
        damage: a.topStriker.damage,
        armyName: a.name,
      };
    }
  });

  // Top Dark Navy Header Band
  doc.setFillColor(20, 28, 33);
  doc.rect(0, 0, 297, 44, "F");

  // Red/Rose Accent Line
  doc.setFillColor(244, 63, 94);
  doc.rect(0, 43, 297, 1.8, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(
    "WAR ERA - TUM ORDULARIN BUGUNE AIT HASAR SIRALAMASI RAPORU",
    14,
    15,
  );

  // Subtitle
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(187, 225, 250);
  doc.text(
    `Nizam-i Turkiye Takip Paneli | Rapor Tarihi: ${dateStr} | Referans Baz Cizgisi: ${baselineDateStr} | Toplam: ${armies.length} Ordu`,
    14,
    23,
  );

  // 4 Top Cards (Summary Badges)
  const cardY = 27;
  const cardW = 63;
  const cardH = 13;
  const gap = 6;
  const startX = 14;

  const cards = [
    {
      title: "TOPLAM BUGUNKU HASAR",
      value: `${formatDmg(totalTodayDamage)} DMG`,
      color: [244, 63, 94],
    },
    {
      title: "LIDER ORDU (1. SIRA)",
      value: `${topArmy.name} (${formatDmg(topArmy.todayDamage)})`,
      color: [251, 191, 36],
    },
    {
      title: "TOPLAM ASKER",
      value: `${totalSoldiers} Savasci`,
      color: [56, 189, 248],
    },
    {
      title: "GUNUN EN IYI VURUCUSU",
      value: `${overallTopStriker.username} (${formatDmg(overallTopStriker.damage)})`,
      color: [52, 211, 153],
    },
  ];

  cards.forEach((c, idx) => {
    const x = startX + idx * (cardW + gap);
    doc.setFillColor(30, 41, 48);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "F");

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(c.color[0], c.color[1], c.color[2]);
    doc.text(c.title, x + 3, cardY + 4.5);

    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(c.value, x + 3, cardY + 10);
  });

  // Table Data
  const tableData: any[] = armies.map((a) => {
    const pct =
      totalTodayDamage > 0
        ? ((a.todayDamage / totalTodayDamage) * 100).toFixed(1) + "%"
        : "0%";
    const mvpStr =
      a.topStriker && a.topStriker.damage > 0
        ? `${a.topStriker.username} (${formatDmg(a.topStriker.damage)})`
        : a.topStriker?.username || "-";

    return [
      `#${a.rank}`,
      a.name,
      `${a.memberCount} Asker`,
      formatDmg(a.todayDamage) + " DMG",
      pct,
      formatDmg(a.weeklyDamage) + " DMG",
      mvpStr,
      formatDmg(a.avgDamagePerMember) + " DMG/Asker",
    ];
  });

  // Add Grand Total summary row
  tableData.push([
    "TOPLAM",
    `${armies.length} ORDU GENEL TOPLAM`,
    `${totalSoldiers} Asker`,
    formatDmg(totalTodayDamage) + " DMG",
    "100%",
    formatDmg(totalWeeklyDamage) + " DMG",
    `${overallTopStriker.username} (${formatDmg(overallTopStriker.damage)})`,
    formatDmg(
      totalSoldiers > 0 ? Math.round(totalTodayDamage / totalSoldiers) : 0,
    ) + " DMG/Asker",
  ]);

  autoTable(doc, {
    startY: 48,
    head: [
      [
        "SIRA",
        "ORDU ADI",
        "UYE",
        "BUGUNKU HASAR",
        "PAY (%)",
        "HAFTALIK HASAR",
        "EN YUKSEK VURAN (MVP)",
        "ORT. ASKER BASI HASAR",
      ],
    ],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [30, 41, 48],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: 16, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 50, fontStyle: "bold" },
      2: { cellWidth: 26, halign: "center" },
      3: {
        cellWidth: 42,
        halign: "right",
        fontStyle: "bold",
        textColor: [225, 29, 72],
      },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 38, halign: "right" },
      6: { cellWidth: 42, halign: "left" },
      7: { cellWidth: 35, halign: "right" },
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data) => {
      // Highlight Grand Total row
      if (data.row.index === armies.length) {
        data.cell.styles.fillColor = [254, 242, 242];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [159, 18, 57];
      } else if (data.row.index === 0 && data.column.index === 0) {
        // Gold 1st place
        data.cell.styles.textColor = [217, 119, 6];
      }
    },
    margin: { left: 14, right: 14 },
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `War Era Telemetri - 8 Ordu Gunluk Hasar Raporu | Supabase & War Era Live API | Sayfa ${i} / ${pageCount}`,
      14,
      202,
    );
  }

  const cleanDate = dateStr.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `WarEra_Tum_Ordular_Gunluk_Hasar_Raporu_${cleanDate}.pdf`;
  doc.save(filename);
}
