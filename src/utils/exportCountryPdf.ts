import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CountryStatsResponse, LevelStatItem } from '../types';

/**
 * Clean and transliterate Turkish characters to standard Latin/ASCII
 * to prevent character corruption or missing glyphs in jsPDF's Helvetica font.
 */
function cleanPdfText(str: string = ''): string {
  if (!str) return '';
  return String(str)
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/•/g, '-')
    .replace(/[—–]/g, '-');
}

export function exportCountryStatsToPDF(data: CountryStatsResponse, viewMode: 'combat' | 'economy' | 'all' = 'combat') {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const now = new Date();
  const dateStr = now.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const stats = data.levelStats || [];
  const armies = data.armies || [];
  const totalPlayers = data.totalPlayers || stats.reduce((sum, s) => sum + s.playerCount, 0) || 1;

  // Calculate summary metrics
  const totalFactories = stats.reduce((sum, s) => sum + s.totalFactories, 0);
  const totalAutomated = stats.reduce((sum, s) => sum + s.totalAutomatedLevel, 0);
  const totalWealth = stats.reduce((sum, s) => sum + (s.totalWealth || 0), 0);
  const totalLevel = stats.reduce((sum, s) => sum + (s.level * s.playerCount), 0);
  const totalCombat = data.totalCombatPlayers ?? stats.reduce((sum, s) => sum + (s.combatCount || 0), 0);
  const totalEconomy = data.totalEconomyPlayers ?? stats.reduce((sum, s) => sum + (s.economyCount || 0), 0);

  const avgFactories = (totalFactories / totalPlayers).toFixed(2);
  const avgAutomated = (totalAutomated / totalPlayers).toFixed(1);
  const avgWealth = Math.round(totalWealth / totalPlayers).toLocaleString('tr-TR');
  const avgLevel = (totalLevel / totalPlayers).toFixed(1);
  const combatPercent = totalPlayers > 0 ? Math.round((totalCombat / totalPlayers) * 100) : 0;
  const economyPercent = totalPlayers > 0 ? Math.round((totalEconomy / totalPlayers) * 100) : 0;

  const minLevel = stats.length > 0 ? Math.min(...stats.map((s) => s.level)) : 1;
  const maxLevel = stats.length > 0 ? Math.max(...stats.map((s) => s.level)) : 50;

  const modeBadge = viewMode === 'combat' ? ' (SAVAS MODU)' : viewMode === 'economy' ? ' (EKONOMI MODU)' : '';

  // Document metadata
  doc.setProperties({
    title: `WarEra Ulke Istatistikleri Raporu${modeBadge} - ${dateStr}`,
    subject: '6 Askeri Birlik Seviye, Fabrika, Motor Gucu, Servet ve Savas/Ekonomi Modu Analizi',
    author: 'WarEra Military Unit Tracker',
    creator: 'Military Unit Dashboard',
  });

  // Header Banner Graphics (Anthracite / Deep Blue)
  doc.setFillColor(24, 35, 41); // #182329
  doc.rect(0, 0, 842, 60, 'F');

  // Cyan Accent Line
  doc.setFillColor(50, 130, 184); // #3282B8
  doc.rect(0, 60, 842, 3, 'F');

  // Title & Subtitle
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(cleanPdfText(`WARERA ULKE ISTATISTIKLERI RAPORU${modeBadge}`), 35, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(187, 225, 250); // #BBE1FA
  doc.text(
    cleanPdfText('6 Askeri Birlik Genel Analizi (Turkic Tribe, ASHINA, ASHINA Reserve, Legio Panthera, BEASTs, Deliler)'),
    35,
    46
  );

  // Date / Time Box (Right aligned)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`Rapor Tarihi: ${dateStr} ${timeStr}`, 807, 30, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(187, 225, 250);
  doc.text(cleanPdfText(`Toplam ${totalPlayers} Asker | ${armies.length} Ordu`), 807, 46, { align: 'right' });

  // Summary Metrics Cards Bar
  doc.setFillColor(20, 28, 33); // #141C21
  doc.roundedRect(35, 75, 772, 45, 4, 4, 'F');
  doc.setDrawColor(50, 130, 184);
  doc.setLineWidth(0.5);
  doc.roundedRect(35, 75, 772, 45, 4, 4, 'S');

  // 6 Metric Columns
  const cardWidth = 772 / 6;
  const metrics = [
    { label: 'TOPLAM ASKER', val: `${totalPlayers} Asker`, sub: `${armies.length} Askeri Birlik` },
    { label: 'TOPLAM SEVIYE', val: `${totalLevel.toLocaleString('tr-TR')} Lv`, sub: `Ort. ${avgLevel} Lv / Asker` },
    { label: 'SAVAS MODU', val: `${totalCombat} Asker`, sub: `%${combatPercent} Savas Odakli` },
    { label: 'EKONOMI MODU', val: `${totalEconomy} Asker`, sub: `%${economyPercent} Ekonomi Odakli` },
    { label: 'TOPLAM MOTOR GUCU', val: `${totalAutomated} Lv`, sub: `Ort. ${avgAutomated} Lv / Asker` },
    { label: 'TOPLAM SERVET', val: `${Math.round(totalWealth).toLocaleString('tr-TR')} G`, sub: `Ort. ${avgWealth} G / Asker` },
  ];

  metrics.forEach((m, i) => {
    const x = 35 + i * cardWidth + cardWidth / 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(187, 225, 250);
    doc.text(cleanPdfText(m.label), x, 90, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(cleanPdfText(m.val), x, 103, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(150, 180, 205);
    doc.text(cleanPdfText(m.sub), x, 114, { align: 'center' });

    if (i < 5) {
      doc.setDrawColor(50, 130, 184);
      doc.setLineWidth(0.3);
      doc.line(35 + (i + 1) * cardWidth, 80, 35 + (i + 1) * cardWidth, 115);
    }
  });

  // Table Body Rows
  const tableRows = stats.map((s) => {
    const pct = s.percentage || Number(((s.playerCount / totalPlayers) * 100).toFixed(1));
    const combat = s.combatCount ?? 0;
    const eco = s.economyCount ?? 0;
    const ecoRatio = s.economyRatio ?? (s.playerCount > 0 ? Number(((eco / s.playerCount) * 100).toFixed(1)) : 0);

    return [
      `Lv. ${s.level}`,
      `${s.playerCount}`,
      `%${pct}`,
      `${combat} S / ${eco} E (%${ecoRatio})`,
      `${Number(s.avgFactories).toFixed(2)}`,
      `${s.totalFactories}`,
      `${Number(s.avgAutomatedLevel).toFixed(1)} Lv`,
      `${s.totalAutomatedLevel} Lv`,
      `${Math.round(Number(s.avgWealth || 0)).toLocaleString('tr-TR')} G`,
      `${Math.round(Number(s.totalWealth || 0)).toLocaleString('tr-TR')} G`,
    ];
  });

  // Total Summary Footer Row
  tableRows.push([
    'TOPLAM / ORT.',
    `${totalPlayers}`,
    '100%',
    `${totalCombat} S / ${totalEconomy} E (%${economyPercent})`,
    `${avgFactories}`,
    `${totalFactories}`,
    `${avgAutomated} Lv`,
    `${totalAutomated} Lv`,
    `${avgWealth} G`,
    `${Math.round(totalWealth).toLocaleString('tr-TR')} G`,
  ]);

  autoTable(doc, {
    startY: 130,
    margin: { left: 35, right: 35, bottom: 35 },
    head: [
      [
        cleanPdfText('Seviye'),
        cleanPdfText('Asker'),
        cleanPdfText('Oran (%)'),
        cleanPdfText('Savaş / Eko'),
        cleanPdfText('Ort. Fabrika'),
        cleanPdfText('Toplam Fabrika'),
        cleanPdfText('Ort. Motor'),
        cleanPdfText('Toplam Motor'),
        cleanPdfText('Ort. Servet (Gold)'),
        cleanPdfText('Toplam Servet (Gold)'),
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 76, 117], // #0F4C75
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding: 5,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 8,
      cellPadding: 4,
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold', cellWidth: 48 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 40 },
      2: { halign: 'center', cellWidth: 46 },
      3: { halign: 'center', cellWidth: 80 },
      4: { halign: 'center', cellWidth: 60 },
      5: { halign: 'center', cellWidth: 68 },
      6: { halign: 'center', cellWidth: 60 },
      7: { halign: 'center', cellWidth: 68 },
      8: { halign: 'right', fontStyle: 'bold', cellWidth: 95 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 107 },
    },
    didParseCell: (dataCell) => {
      // Style the last summary footer row
      if (dataCell.row.index === tableRows.length - 1) {
        dataCell.cell.styles.fillColor = [240, 245, 250];
        dataCell.cell.styles.fontStyle = 'bold';
        dataCell.cell.styles.textColor = [15, 76, 117];
      }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (hookData) => {
      // Footer on every page
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(130, 145, 160);

      // Left footer
      doc.text(
        cleanPdfText('WarEra Askeri Birlik Takip Sistemi - Gizli & Guvenli Ulke Raporu'),
        35,
        575
      );

      // Right footer
      doc.text(
        cleanPdfText(`Sayfa ${hookData.pageNumber} / ${pageCount}`),
        807,
        575,
        { align: 'right' }
      );
    },
  });

  // Save the generated PDF file
  const fileName = `WarEra_Ulke_Istatistikleri_Raporu_${now.toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}
