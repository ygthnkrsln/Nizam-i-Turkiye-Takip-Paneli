import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ArmyReportMeta {
  muName: string;
  muId: string;
  memberCount: number;
  totalDamage: number;
  dateStr: string;
}

export interface ArmyReportColumns {
  pill: boolean;
  resources: boolean;
  damage: boolean;
  skillsReset: boolean;
}

export interface ArmyReportMember {
  username: string;
  level: number;
  damage: number;
  pillStatus: string;
  resources: string;
  skillsReset: string;
}

function formatDmg(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + "B";
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString("tr-TR");
}

export function generateSingleDayPdf(
  meta: ArmyReportMeta,
  members: ArmyReportMember[],
  columns: ArmyReportColumns,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFillColor(24, 35, 41);
  doc.rect(0, 0, 210, 40, "F");
  doc.setFillColor(244, 63, 94);
  doc.rect(0, 39, 210, 1.5, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("WAR ERA - GUNLUK ORDU HASAR RAPORU", 14, 15);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(187, 225, 250);
  doc.text(`Askeri Birlik: ${meta.muName} | Tarih: ${meta.dateStr}`, 14, 23);
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `Toplam Hasar: ${formatDmg(meta.totalDamage)} DMG  |  Toplam Asker: ${meta.memberCount}`,
    14,
    31,
  );

  const headers = ["Asker Üyesi"];
  if (columns.pill) headers.push("Pill");
  if (columns.resources) headers.push("Kaynaklar");
  if (columns.damage) headers.push("Günlük Hasar (DMG)");
  if (columns.skillsReset) headers.push("Skills Reset");

  const sorted = [...members].sort((a, b) => b.damage - a.damage);
  const body = sorted.map((member) => {
    const row = [`${member.username} (Lv.${member.level})`];
    if (columns.pill) {
      row.push(
        member.pillStatus === "buff"
          ? "Buff %60"
          : member.pillStatus === "debuff"
            ? "Debuff"
            : "Hazır",
      );
    }
    if (columns.resources) row.push(member.resources);
    if (columns.damage) row.push(formatDmg(member.damage));
    if (columns.skillsReset) row.push(member.skillsReset);
    return row;
  });

  autoTable(doc, {
    startY: 46,
    head: [headers],
    body,
    theme: "grid",
    headStyles: {
      fillColor: [28, 40, 48],
      textColor: [244, 63, 94],
      fontStyle: "bold",
      fontSize: 9,
      halign: "left",
    },
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `War Era Telemetri Sistemi - 02:55 TSI Snapshot Guvencesi | Sayfa ${page} / ${pageCount}`,
      14,
      290,
    );
  }

  const cleanMuName = meta.muName.replace(/[^a-zA-Z0-9]/g, "_");
  doc.save(`WarEra_Hasar_Raporu_${cleanMuName}_${meta.dateStr}.pdf`);
}
