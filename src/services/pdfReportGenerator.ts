import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  reportType: 'singleDay' | 'threeDaysConsolidated';
}

function formatDmg(value: number): string {
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(2) + 'B';
  }
  if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(2) + 'M';
  }
  if (value >= 1_000) {
    return (value / 1_000).toFixed(1) + 'K';
  }
  return value.toLocaleString('tr-TR');
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
  }>
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Background header band (Dark tactical navy)
  doc.setFillColor(24, 35, 41);
  doc.rect(0, 0, 210, 40, 'F');

  // Accent line (Rose)
  doc.setFillColor(244, 63, 94);
  doc.rect(0, 39, 210, 1.5, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('WAR ERA - GUNLUK ORDU HASAR RAPORU', 14, 15);

  // Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(187, 225, 250);
  doc.text(`Askeri Birlik: ${meta.muName} | Tarih: ${meta.dateStr}`, 14, 23);

  // Total summary badge
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `Toplam Hasar: ${formatDmg(meta.totalDamage)} DMG  |  Toplam Asker: ${meta.memberCount}`,
    14,
    31
  );

  // Table rows
  const sorted = [...members].sort((a, b) => b.damage - a.damage);
  const tableData = sorted.map((m, idx) => [
    (idx + 1).toString(),
    m.username,
    `Lv.${m.level}`,
    m.role === 'leader' ? 'Lider' : m.role === 'commander' ? 'Komutan' : m.role === 'manager' ? 'Yonetici' : 'Asker',
    formatDmg(m.damage),
    m.healthStr || '-',
    m.pillStatus === 'buff' ? 'Buff %60' : m.pillStatus === 'debuff' ? 'Debuff' : 'Hazir',
  ]);

  autoTable(doc, {
    startY: 46,
    head: [['#', 'Asker Adı', 'Seviye', 'Gorev', 'Gunluk Hasar', 'Can (HP)', 'Pill']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [28, 40, 48],
      textColor: [244, 63, 94],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 48, fontStyle: 'bold' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      5: { cellWidth: 26, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
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
      290
    );
  }

  // Trigger browser download
  const cleanMuName = meta.muName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `WarEra_Hasar_Raporu_${cleanMuName}_${meta.dateStr}.pdf`;
  doc.save(filename);
}

/**
 * Generate a Consolidated 3-Day History PDF Report showing damage progression for each day and 3-day total
 */
export function generateThreeDaysConsolidatedPdf(
  meta: ArmyReportMeta,
  dates: [string, string, string], // [Day 1 (oldest), Day 2, Day 3 (latest/today)]
  items: MemberHistoryReportItem[]
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Header band
  doc.setFillColor(24, 35, 41);
  doc.rect(0, 0, 297, 38, 'F');

  // Accent bar
  doc.setFillColor(244, 63, 94);
  doc.rect(0, 37, 297, 1.5, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('WAR ERA - SON 3 GUNLUK KONSOLIDE HASAR & PERFORMANS RAPORU', 14, 14);

  // Subtitle
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(187, 225, 250);
  doc.text(
    `Birlik: ${meta.muName} | Tarih Aralığı: ${dates[0]} - ${dates[2]} (02:55 TSİ Döngüsü)`,
    14,
    22
  );

  const totalAll3Days = items.reduce((sum, it) => sum + it.total3DayDamage, 0);
  const avgDaily = Math.round(totalAll3Days / 3);

  doc.text(
    `3 Günlük Toplam Hasar: ${formatDmg(totalAll3Days)} DMG  |  Günlük Ortalama: ${formatDmg(avgDaily)} DMG  |  Toplam Asker: ${meta.memberCount}`,
    14,
    30
  );

  // Table setup
  const sorted = [...items].sort((a, b) => b.total3DayDamage - a.total3DayDamage);

  const tableData = sorted.map((m, idx) => [
    (idx + 1).toString(),
    m.username,
    `Lv.${m.level}`,
    m.role === 'leader' ? 'Lider' : m.role === 'commander' ? 'Komutan' : m.role === 'manager' ? 'Yönetici' : 'Asker',
    formatDmg(m.day1Damage),
    formatDmg(m.day2Damage),
    formatDmg(m.day3Damage),
    formatDmg(m.total3DayDamage),
  ]);

  autoTable(doc, {
    startY: 44,
    head: [
      [
        '#',
        'Asker Adı',
        'Seviye',
        'Görev',
        `1. Gün (${dates[0]})`,
        `2. Gün (${dates[1]})`,
        `3. Gün (${dates[2]})`,
        '3 Günlük Toplam Hasar',
      ],
    ],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [28, 40, 48],
      textColor: [244, 63, 94],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 55, fontStyle: 'bold' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 24, halign: 'center' },
      4: { cellWidth: 42, halign: 'right' },
      5: { cellWidth: 42, halign: 'right' },
      6: { cellWidth: 42, halign: 'right' },
      7: { cellWidth: 45, halign: 'right', fontStyle: 'bold', textColor: [190, 18, 60] },
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
      200
    );
  }

  const cleanMuName = meta.muName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `WarEra_3Gunluk_Hasar_Raporu_${cleanMuName}_${dates[0]}_${dates[2]}.pdf`;
  doc.save(filename);
}
