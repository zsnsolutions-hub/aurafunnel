// jsPDF is loaded on-demand (~400 kB) so the cost is only paid when the user
// actually triggers a PDF export.
async function loadJsPDF() {
  const { default: jsPDF } = await import('jspdf');
  return jsPDF;
}

// ── Proposal PDF ──
export async function generateProposalPdf(params: {
  companyName: string;
  recipientCompany: string;
  date: string;
  sections: { label: string; body: string }[];
  personalization?: Record<string, string>;
}): Promise<void> {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const applyPersonalization = (text: string): string => {
    let result = text;
    if (params.personalization) {
      for (const [tag, value] of Object.entries(params.personalization)) {
        result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
      }
    }
    return result;
  };

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - 25) {
      // Footer on current page
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`${params.companyName} — Confidential`, margin, pageHeight - 10);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      doc.addPage();
      y = margin;
    }
  };

  // ── Header bar ──
  doc.setFillColor(79, 70, 229); // indigo-600
  doc.rect(0, 0, pageWidth, 35, 'F');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('Proposal', margin, 18);
  doc.setFontSize(10);
  doc.text(`Prepared for ${applyPersonalization(params.recipientCompany)}`, margin, 28);
  doc.setFontSize(9);
  doc.text(params.date, pageWidth - margin, 28, { align: 'right' });

  y = 50;

  // ── Sections ──
  for (const section of params.sections) {
    checkPageBreak(30);

    // Section accent bar
    doc.setFillColor(79, 70, 229);
    doc.rect(margin, y, 3, 8, 'F');

    // Section header
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(section.label.toUpperCase(), margin + 7, y + 6);
    y += 14;

    // Section body with word wrap
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // slate-600
    const bodyText = applyPersonalization(section.body);
    const lines = doc.splitTextToSize(bodyText, contentWidth);

    for (const line of lines) {
      checkPageBreak(6);
      doc.text(line, margin, y);
      y += 5;
    }

    y += 10;
  }

  // ── Footer on last page ──
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text(`${params.companyName} — Confidential`, margin, pageHeight - 10);
  doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: 'right' });

  const filename = `proposal-${params.recipientCompany.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
  doc.save(filename);
}

// ── Email Sequence PDF ──
export async function generateEmailSequencePdf(
  blocks: { title: string; subject: string; body: string }[]
): Promise<void> {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - 25) {
      doc.setFontSize(8);
      doc.setTextColor(160, 160, 160);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
      doc.addPage();
      y = margin;
    }
  };

  // ── Header ──
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('Email Sequence', margin, 18);
  doc.setFontSize(9);
  doc.text(`${blocks.length} emails — ${new Date().toLocaleDateString()}`, pageWidth - margin, 18, { align: 'right' });

  y = 42;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    checkPageBreak(35);

    // Block header
    doc.setFillColor(79, 70, 229);
    doc.rect(margin, y, 3, 8, 'F');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text(`${block.title}`, margin + 7, y + 6);
    y += 14;

    // Subject line
    checkPageBreak(10);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('Subject:', margin, y);
    doc.setTextColor(30, 41, 59);
    doc.text(block.subject, margin + 20, y);
    y += 8;

    // Body
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(block.body, contentWidth);

    for (const line of lines) {
      checkPageBreak(6);
      doc.text(line, margin, y);
      y += 5;
    }

    y += 12;

    // Separator between blocks
    if (i < blocks.length - 1) {
      checkPageBreak(8);
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.line(margin, y - 6, pageWidth - margin, y - 6);
    }
  }

  // Footer on last page
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 10, { align: 'right' });

  doc.save(`email-sequence-${Date.now()}.pdf`);
}
