import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLeaveStatusEmail,
  getPasswordResetEmail,
  getPayslipReadyEmail,
  getTestEmail,
  getWelcomeInviteEmail,
} from '../src/services/email-templates';

test('welcome invite email is bilingual and includes activation details', () => {
  const { text, html } = getWelcomeInviteEmail({
    name: 'Budi Santoso',
    inviteLink: 'https://app.test/reset-password?token=abc123',
    companyName: 'SH Automation Pte Ltd',
    companyEmail: 'budi@shautomation.id',
    appUrl: 'https://app.test',
  });

  assert.match(html, /Aktivasi akun kepegawaian/);
  assert.match(html, /Activate your employee account/);
  assert.match(html, /Atur kata sandi/);
  assert.match(html, /Budi Santoso/);
  assert.match(html, /budi@shautomation\.id/);
  assert.match(html, /https:\/\/app\.test\/reset-password\?token=abc123/);
  assert.match(html, /7 hari/);
  assert.match(text, /Yth\. Budi Santoso/);
  assert.match(text, /Dear Budi Santoso/);
  assert.match(text, /expires in 7 days/);
});

test('welcome invite escapes user-provided HTML', () => {
  const { html } = getWelcomeInviteEmail({
    name: '<script>alert(1)</script>',
    inviteLink: 'https://app.test/invite',
    companyName: 'Company',
    appUrl: 'https://app.test',
  });

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('leave status email renders both statuses and notes bilingually', () => {
  const approved = getLeaveStatusEmail({
    employeeName: 'Siti',
    leaveType: 'Cuti Tahunan',
    startDate: '2026-11-10',
    endDate: '2026-11-12',
    totalDays: 3,
    status: 'approved',
    reviewerName: 'Rinaldi',
    note: 'Selamat berlibur',
    appUrl: 'https://app.test/app/requests',
    companyName: 'SH Automation Pte Ltd',
  });

  assert.match(approved.html, /Pengajuan cuti disetujui/);
  assert.match(approved.html, /Status: <span[^>]*>Disetujui<\/span>/);
  assert.match(approved.html, /Approved/);
  assert.match(approved.html, /Selamat berlibur/);
  assert.match(approved.html, /Buka portal karyawan/);
  assert.match(approved.text, /3 hari/);
  assert.match(approved.text, /3 days/);

  const rejected = getLeaveStatusEmail({
    employeeName: 'Siti',
    leaveType: 'Cuti Tahunan',
    startDate: '2026-11-10',
    endDate: '2026-11-12',
    totalDays: 3,
    status: 'rejected',
    reviewerName: 'Rinaldi',
  });

  assert.match(rejected.html, /Pengajuan cuti ditolak/);
  assert.match(rejected.html, /Status: <span[^>]*>Ditolak<\/span>/);
  assert.match(rejected.html, /Rejected/);
});

test('payslip email shows the net pay and one action', () => {
  const { html, text } = getPayslipReadyEmail({
    employeeName: 'Budi',
    periodTitle: 'November 2026',
    takeHomePayFormatted: 'Rp 8.500.000',
    appUrl: 'https://app.test/app/payslips',
    companyName: 'SH Automation Pte Ltd',
  });

  assert.match(html, /Slip gaji November 2026/);
  assert.match(html, /Your payslip is available/);
  assert.match(html, /Rp 8\.500\.000/);
  assert.match(html, /Buka slip gaji/);
  assert.match(text, /Gaji bersih diterima: Rp 8.500.000/);
});

test('password reset email is bilingual and states the expiry', () => {
  const { html, text } = getPasswordResetEmail({
    name: 'Budi',
    resetLink: 'https://app.test/reset-password?token=xyz',
    companyName: 'SH Automation Pte Ltd',
    expiresMinutes: 60,
  });

  assert.match(html, /Reset kata sandi akun kepegawaian/);
  assert.match(html, /Password reset request/);
  assert.match(html, /Buat kata sandi baru/);
  assert.match(html, /60 menit/);
  assert.match(html, /60 minutes/);
  assert.match(text, /https:\/\/app\.test\/reset-password\?token=xyz/);
});

test('connection test email contains sender metadata', () => {
  const { html } = getTestEmail({
    companyName: 'SH Automation Pte Ltd',
    fromAddress: 'hr@shautomation.id',
    smtpHost: 'smtp.purelymail.com',
  });

  assert.match(html, /Koneksi email berhasil/);
  assert.match(html, /Email delivery is working/);
  assert.match(html, /hr@shautomation\.id/);
  assert.match(html, /smtp\.purelymail\.com/);
});

test('transactional emails contain no em dash', () => {
  const messages = [
    getWelcomeInviteEmail({
      name: 'Budi',
      inviteLink: 'https://app.test/invite',
      companyName: 'SH Automation Pte Ltd',
      appUrl: 'https://app.test',
    }),
    getLeaveStatusEmail({
      employeeName: 'Siti',
      leaveType: 'Cuti Tahunan',
      startDate: '2026-11-10',
      endDate: '2026-11-12',
      totalDays: 3,
      status: 'approved',
      reviewerName: 'Rinaldi',
    }),
    getPayslipReadyEmail({
      employeeName: 'Budi',
      periodTitle: 'November 2026',
      takeHomePayFormatted: 'Rp 8.500.000',
      appUrl: 'https://app.test',
    }),
    getPasswordResetEmail({
      name: 'Budi',
      resetLink: 'https://app.test/reset',
      companyName: 'SH Automation Pte Ltd',
    }),
    getTestEmail({ companyName: 'SH Automation Pte Ltd', fromAddress: 'hr@test.id' }),
  ];

  for (const message of messages) {
    assert.ok(!message.text.includes('\u2014'));
    assert.ok(!message.html.includes('\u2014'));
  }
});
