import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DonationItem, PlayerStats } from '../types';
import { formatNumber, formatRelativeTime } from './formatters';

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

export function exportPlayerTableToPDF(players: PlayerStats[], muName: string = 'Turkic Tribe') {
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

  const effectiveMuName = cleanPdfText(muName || 'Turkic Tribe');
  const headerTitle = `${effectiveMuName.toUpperCase()} - RESMI BAGIS RAPORU`;

  // PDF Document Metadata
  doc.setProperties({
    title: `${effectiveMuName} - Bagis Raporu (${dateStr})`,
    subject: 'WarEra Askeri Birlik Bagis Raporu (Son 7 Bagis)',
    author: 'WarEra Military Unit Tracker',
    creator: 'Military Unit Community Dashboard',
  });

  // Calculate executive summary statistics
  const totalSoldiers = players.length;
  let activeContributorsCount = 0;

  players.forEach((p) => {
    const pTotal =
      p.totalDonations !== undefined && p.totalDonations > 0
        ? p.totalDonations
        : p.latestDonations?.reduce((sum, d) => sum + (Number(d.amount) || 0), 0) || 0;

    if (pTotal > 0 || (p.latestDonations && p.latestDonations.length > 0)) {
      activeContributorsCount++;
    }
  });

  const participationRate = totalSoldiers > 0 ? Math.round((activeContributorsCount / totalSoldiers) * 100) : 0;

  // Format single donation entry: "Bağış yeri, +37 Altın, 7m ago"
  const formatDonationCell = (d?: DonationItem): string => {
    if (!d || d.amount === undefined || d.amount === null || isNaN(Number(d.amount))) {
      return '';
    }
    const amt = Number(d.amount);
    const relTime = formatRelativeTime(d.timestamp);

    let destName = 'Turkiye';
    if (d.target === 'mu') {
      destName = d.targetName || muName || 'Ordu';
    } else if (d.targetName) {
      destName = d.targetName;
    } else if (d.countryCode) {
      const cc = d.countryCode.toUpperCase();
      if (cc === 'AE') destName = 'BAE';
      else if (cc === 'AZ') destName = 'Azerbaycan';
      else if (cc === 'CM') destName = 'Kamerun';
      else destName = 'Turkiye';
    }

    const cleanDest = cleanPdfText(destName);
    return cleanPdfText(`${cleanDest}, +${formatNumber(amt)} Altin, ${relTime}`);
  };

  // Top Page 1 Header Graphics: Accent Bars (Anthracite & Turquoise)
  doc.setFillColor(18, 24, 32); // Deep Anthracite
  doc.rect(0, 0, 842, 3.5, 'F');
  doc.setFillColor(8, 145, 178); // Vibrant Turquoise (Cyan-600)
  doc.rect(0, 3.5, 842, 1.8, 'F');

  // Document Title & Subtitle (Left side)
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(headerTitle, 26, 26);

  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(
    cleanPdfText('Birlik Askerlerinin Ulke Hazinesi ve Ordu Fonuna Yaptigi Son 7 Bagis Kayitlari'),
    26,
    39
  );

  // Executive Summary Card (Right side)
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(494, 11, 322, 36, 4, 4, 'FD');

  // Mini column headers inside summary box
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('KAYITLI ASKER', 504, 22);
  doc.text('BAGISCI ASKER', 602, 22);
  doc.text('RAPOR TARIHI', 716, 22);

  // Mini column values inside summary box
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(`${totalSoldiers} Asker`, 504, 37);

  doc.setTextColor(8, 145, 178); // Turquoise (Cyan-600)
  doc.text(`${activeContributorsCount} (%${participationRate})`, 602, 37);

  doc.setTextColor(71, 85, 105); // slate-600
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.text(`${dateStr} ${timeStr}`, 716, 37);

  // Prepare table data with 9 columns (Index, Username, 7 donations)
  const tableData = players.map((p, index) => {
    // Sort donations by most recent timestamp descending
    const sortedDonations =
      p.latestDonations && p.latestDonations.length > 0
        ? [...p.latestDonations].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        : [];

    return [
      String(index + 1),
      cleanPdfText(p.username),
      formatDonationCell(sortedDonations[0]),
      formatDonationCell(sortedDonations[1]),
      formatDonationCell(sortedDonations[2]),
      formatDonationCell(sortedDonations[3]),
      formatDonationCell(sortedDonations[4]),
      formatDonationCell(sortedDonations[5]),
      formatDonationCell(sortedDonations[6]),
    ];
  });

  // Dynamic layout calculation
  const isCompact = players.length <= 26;

  autoTable(doc, {
    startY: 56,
    tableWidth: 790,
    margin: { top: 46, bottom: 28, left: 26, right: 26 },
    head: [[
      '#',
      cleanPdfText('Asker / Oyuncu Adi'),
      cleanPdfText('Son Bagis'),
      '',
      '',
      '',
      '',
      '',
      ''
    ]],
    body: tableData,
    theme: 'grid',
    pageBreak: 'auto',
    showHead: 'everyPage',
    styles: {
      fontSize: 6.8,
      cellPadding: isCompact
        ? { top: 3.2, bottom: 3.2, left: 3.5, right: 3.5 }
        : { top: 3.8, bottom: 3.8, left: 3.5, right: 3.5 },
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: [226, 232, 240], // slate-200
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: [18, 24, 32], // Deep Anthracite
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
      cellPadding: { top: 4.5, bottom: 4.5, left: 3.5, right: 3.5 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center', textColor: [100, 116, 139] },
      1: { cellWidth: 112, fontStyle: 'bold', textColor: [15, 23, 42] },
      2: { cellWidth: 94, textColor: [30, 41, 59] },
      3: { cellWidth: 94, textColor: [30, 41, 59] },
      4: { cellWidth: 94, textColor: [30, 41, 59] },
      5: { cellWidth: 94, textColor: [30, 41, 59] },
      6: { cellWidth: 94, textColor: [30, 41, 59] },
      7: { cellWidth: 94, textColor: [30, 41, 59] },
      8: { cellWidth: 94, textColor: [30, 41, 59] },
    },
    didParseCell: (data) => {
      // Style empty donation placeholders with subtle centered gray
      if (data.section === 'body' && data.column.index >= 2 && data.column.index <= 8) {
        if (data.cell.text && (data.cell.text[0] === '-' || data.cell.text[0] === '—')) {
          data.cell.styles.textColor = [148, 163, 184]; // slate-400
          data.cell.styles.halign = 'center';
        }
      }
    },
  });

  // Post-table pass: render consistent header continuation, divider lines, and total page footers
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Header Accent Line on every page (Turquoise)
    doc.setFillColor(8, 145, 178);
    doc.rect(0, 0, 842, 3.5, 'F');

    // Continuation Header for subsequent pages (pages 2+)
    if (i > 1) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`${effectiveMuName.toUpperCase()} - BAGIS RAPORU (Devami)`, 26, 25);

      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`Tarih: ${dateStr} ${timeStr}   -   Sayfa ${i} / ${totalPages}`, 690, 25);

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(26, 34, 816, 34);
    }

    // Page Footer Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(26, 574, 816, 574);

    // Page Footer Content
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      'WarEra Askeri Birlik Takip Sistemi - Resmi Bagis Kayitlari (Son 7 Bagis Dokumu)',
      26,
      585
    );

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Sayfa ${i} / ${totalPages}`, 762, 585);
  }

  const filename = `${effectiveMuName} - Bagis Raporu, ${dateStr}.pdf`;
  doc.save(filename);
}
