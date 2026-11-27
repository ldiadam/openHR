import { jsPDF } from 'jspdf';

export interface OfferLetterData {
  companyName: string;
  agreementNo: string;
  offerDate: string;
  candidateName: string;
  icNumber: string;
  address: string;
  jobTitle: string;
  startDate: string;
  monthlySalary: number;
  workingHours: string;
  jobScope: string[];
  extraNotes?: string;
}

export function buildOfferLetterPdf(data: OfferLetterData): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (needed = 12) => {
    if (y + needed > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
  };

  const addHeading = (title: string) => {
    ensureSpace(14);
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(title, margin, y);
    y += 5;
  };

  const addPara = (text: string, boldPrefix?: string) => {
    doc.setFontSize(9.5);
    if (boldPrefix) {
      ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.text(boldPrefix, margin, y);
      y += 4.5;
    }
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const line of lines) {
      ensureSpace(6);
      doc.text(line, margin, y);
      y += 4.5;
    }
    y += 1.5;
  };

  const addBullet = (text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(text, maxWidth - 6);
    lines.forEach((line: string, idx: number) => {
      ensureSpace(6);
      doc.text(idx === 0 ? `•  ${line}` : `   ${line}`, margin + 2, y);
      y += 4.5;
    });
  };

  // Top Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`${data.companyName} Agreement No: ${data.agreementNo}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${data.offerDate}`, pageWidth - margin, y, { align: 'right' });
  y += 6;
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // Candidate Block
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Staff Name: ${data.candidateName}`, margin, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.text(`IC/Passport Number: ${data.icNumber || '-'}`, margin, y);
  y += 5.5;
  const addrLines = doc.splitTextToSize(`Address: ${data.address || '-'}`, maxWidth);
  for (const l of addrLines) {
    doc.text(l, margin, y);
    y += 5;
  }
  y += 2;

  doc.setFont('helvetica', 'bold');
  doc.text('Subject: Staff Terms and Conditions', margin, y);
  y += 5.5;
  doc.text(`Post: ${data.jobTitle}`, margin, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.text(`You are employed by the Company as a ${data.jobTitle}.`, margin, y);
  y += 5.5;
  doc.text(`Your start date of Employment: ${data.startDate}`, margin, y);
  y += 6;

  // Job Scope
  addHeading('Job Scope and Work Responsibility');
  addPara('Your responsibilities shall include but not be limited to the following:');
  const scopeItems =
    data.jobScope.length > 0
      ? data.jobScope
      : [`Perform ${data.jobTitle} duties and operational responsibilities assigned by management.`];
  scopeItems.forEach((item) => addBullet(item));
  y += 1.5;
  addPara('The Company shall have the right to change and/or introduce new assignments and duties at any time it sees fit.');

  // Salary
  addHeading('Salary and Bonus');
  const formattedSalary = Number(data.monthlySalary || 0).toLocaleString('id-ID');
  addPara(`Your current Monthly salary is IDR ${formattedSalary}.`, 'Monthly Salary');
  if (data.extraNotes) {
    addPara(data.extraNotes, 'Additional Terms / Benefits');
  }

  // Working Hours
  addHeading('Working Hours');
  addPara(`Official working hours is, ${data.workingHours || 'Monday to Friday: 08:30 to 17:30 hour'}.`, 'Official Working Hour');
  addPara('The Company reserves the right to deduct from your salary automatically if you are habitually late without proper and valid reason.', 'Punctuality');

  // Medical & Dental
  addHeading('Medical and Dental (Confirmed Staff Only)');
  addPara(
    'You can claim only for General Practitioner fee for normal medical consultation and medicine. You are not entitled to claim for any on-going current professional medical fee for any form of existing illness, health care and specialist treatment; reimbursement for dental treatment only on normal check-up and scaling.',
    'Medical Claim / Dental Claim'
  );

  // Leaves
  addHeading('Leaves, Day-off and Medical Leave (Confirmed Staff Only)');
  addPara(
    'Your annual leave is twelve (12) working days for every twelve (12) months continuous service you work with the Company or pro-rated thereof. Priority of any leave approval shall be given to reservist training, medical leave, emergency leave, company service job and applicable on a first come first serve basis. In the event your service is required urgently, the approved leave may be cancelled/delayed without compensation. You are allowed to bring forward only a maximum of 3 days balance leave to the following year. Any unused leave shall be forfeited without compensation or notice.',
    'Annual Leave'
  );
  addPara('Maximum of 6 days per year for medical leave. All claims must be supported by Medical Certificate and submitted within the next working day.', 'Medical Leave');
  addPara('You shall be entitled to apply for maternity leave as per company regulation (1 Month) supported by Marriage Certificate.', 'Maternity Leave (Female Staff Only)');
  addPara('Claim is for maximum three (3) working days and only covers death of immediate family members like parents, parent-in-law, siblings, children, and spouse only.', 'Compassionate Leave');

  // Business Conduct
  addHeading('Business Conduct');
  addPara(
    'During your employment with the company and within three (3) years after you leave the Company, you shall not conduct any businesses or activities or work directly with any client on your own or with others such as competitor, principal, vendor, customer, existing or ex-company staff, friends or relations, to pose a direct or indirect competition in any way to the company. If found, the company will take legal action.'
  );

  // Termination
  addHeading('Termination');
  addPara('The termination of service may be served by either party giving a Thirty (30) days\' notice in writing or salary in lieu of notice. The company reserves the right to terminate immediately without paying for the following reasons:', 'Notice of Termination');
  [
    'Poor performance and not following management instruction after repeated warnings',
    'Violation of company policies and terms',
    'Fraud, theft, or dishonesty',
    'Harassment or workplace violence',
  ].forEach((r) => addBullet(r));
  y += 2;

  addPara('On your last day with the company, you shall return all company properties assigned to you during the term of your employment in good and reasonable condition by signing a checklist on your last day with the company.', 'Company Property');
  addPara('The Company may provide you a laptop to conduct Company business activities and not for personal use in any circumstances. You shall not corrupt, destroy or remove from your computer any Operating System, Computer Settings, Application Software, Email Messages or any file contents.', 'Computer');
  addPara('You shall hand over all name cards, duplicated files and documents that you have kept outside the company.', 'Files and Documents');

  // Breach & Confidentiality
  addHeading('Breach of Contract');
  addPara(
    'At all times (during your employment and 3 years after service termination) you are required to keep all Company information and matters within the Company and not divulge to any unauthorized person within or outside the company. During your employment term, you can be terminated without notice or compensation in lieu of notice for any such breach of agreement or conduct detrimental to the Company\'s welfare. The Company reserves the right to claim for damages to its business, reputation and namesake.',
    'Confidentiality'
  );

  // Agreement & Revision
  addHeading('Agreement');
  addPara(
    'This Agreement shall supersede all previous verbal or written understanding between you and the company. In the event of any infringement to this Agreement, the company shall reserve the right to claim against you for all damages including any proceeding costs and expenses. The Company shall reserve the right to amend this existing Agreement or introduce new policy, as and when it deems fit, in the form of an amendment/appendix to be signed.',
    'Revision'
  );

  // Signatures
  ensureSpace(38);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Agreement between:', margin, y);
  y += 5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  const confirmLines = doc.splitTextToSize(
    '(By my signature, I confirm that I have read, understood and hereby agree to be bound by the Terms and Conditions of this Employment Agreement)',
    maxWidth
  );
  for (const l of confirmLines) {
    doc.text(l, margin, y);
    y += 4.5;
  }
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.line(margin, y, margin + 65, y);
  doc.line(pageWidth - margin - 65, y, pageWidth - margin, y);
  y += 5;
  doc.text(`Dated: _______________`, margin, y);
  doc.text(`For ${data.companyName}`, pageWidth - margin - 65, y);

  return doc;
}
