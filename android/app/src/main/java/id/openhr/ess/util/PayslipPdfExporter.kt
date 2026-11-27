package id.openhr.ess.util

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import id.openhr.ess.data.model.PayslipDetail
import java.io.File
import java.io.FileOutputStream

object PayslipPdfExporter {
    fun exportAndOpen(context: Context, payslip: PayslipDetail, lang: String = "id"): File {
        fun tr(id: String, en: String) = if (lang == "id") id else en

        val doc = PdfDocument()
        val pageWidth = 595 // A4 points
        val pageHeight = 842
        val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, 1).create()
        val page = doc.startPage(pageInfo)
        val canvas = page.canvas

        val margin = 40f
        var y = 46f

        val titlePaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            textSize = 16f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val subtitlePaint = Paint().apply {
            color = Color.parseColor("#64748B")
            textSize = 9.5f
        }
        val sectionPaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            textSize = 10.5f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val bodyPaint = Paint().apply {
            color = Color.parseColor("#1E293B")
            textSize = 10f
        }
        val rightPaint = Paint(bodyPaint).apply {
            textAlign = Paint.Align.RIGHT
        }
        val boldRightPaint = Paint(sectionPaint).apply {
            textAlign = Paint.Align.RIGHT
        }
        val linePaint = Paint().apply {
            color = Color.parseColor("#CBD5E1")
            strokeWidth = 1f
        }
        val darkLinePaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            strokeWidth = 1.8f
        }

        // Letterhead
        canvas.drawText(tr("SLIP GAJI KARYAWAN", "EMPLOYEE PAYSLIP"), margin, y, subtitlePaint)
        y += 18f
        canvas.drawText(payslip.company_name ?: "openHR", margin, y, titlePaint)
        canvas.drawText(tr("RAHASIA", "CONFIDENTIAL"), pageWidth - margin, y, boldRightPaint)
        y += 14f
        canvas.drawText(payslip.company_address ?: "-", margin, y, subtitlePaint)
        y += 13f
        if (!payslip.company_npwp.isNullOrBlank()) {
            canvas.drawText("NPWP: ${payslip.company_npwp}", margin, y, subtitlePaint)
            y += 12f
        }
        canvas.drawLine(margin, y, pageWidth - margin, y, darkLinePaint)
        y += 18f

        // Period & Employee Meta
        canvas.drawText(payslip.run_title ?: "-", margin, y, sectionPaint)
        canvas.drawText(
            "${tr("Periode", "Period")}: ${Formatters.formatDisplayDate(payslip.period_start, lang)} - ${Formatters.formatDisplayDate(payslip.period_end, lang)}",
            pageWidth - margin,
            y,
            rightPaint
        )
        y += 18f

        fun drawMetaRow(label1: String, val1: String, label2: String, val2: String) {
            canvas.drawText("$label1: $val1", margin, y, bodyPaint)
            canvas.drawText("$label2: $val2", pageWidth / 2f + 10f, y, bodyPaint)
            y += 15f
        }

        drawMetaRow(
            tr("Nama", "Name"), payslip.employee_name ?: "-",
            tr("NIK", "ID"), payslip.employee_nik ?: "-"
        )
        drawMetaRow(
            tr("Jabatan", "Title"), payslip.job_title ?: "-",
            tr("Departemen", "Department"), payslip.department_name ?: "-"
        )
        drawMetaRow(
            "PTKP", payslip.ptkp_status ?: "-",
            tr("Bank", "Bank"), listOfNotNull(payslip.bank_name, payslip.bank_account_number).joinToString(" · ").ifBlank { "-" }
        )

        y += 6f
        canvas.drawLine(margin, y, pageWidth - margin, y, linePaint)
        y += 18f

        fun drawMoneyRow(label: String, amount: Double, bold: Boolean = false) {
            canvas.drawText(label, margin, y, if (bold) sectionPaint else bodyPaint)
            canvas.drawText(Formatters.formatRupiah(amount), pageWidth - margin, y, if (bold) boldRightPaint else rightPaint)
            y += 15f
        }

        // Earnings
        canvas.drawText(tr("PENDAPATAN (EARNINGS)", "EARNINGS"), margin, y, sectionPaint)
        y += 16f
        drawMoneyRow(tr("Gaji Pokok", "Base Salary"), payslip.base_salary)
        val prorationDelta = payslip.prorated_salary - payslip.base_salary
        if (prorationDelta != 0.0) {
            drawMoneyRow(tr("Penyesuaian Prorata", "Proration Adjustment"), prorationDelta)
        }
        drawMoneyRow(tr("Tunjangan Tetap", "Fixed Allowance"), payslip.fixed_allowance)
        if (payslip.thr_amount > 0) drawMoneyRow("THR", payslip.thr_amount)
        if (payslip.overtime_pay > 0) drawMoneyRow(tr("Upah Lembur (${payslip.overtime_hours} jam)", "Overtime (${payslip.overtime_hours} hrs)"), payslip.overtime_pay)
        if (payslip.attendance_bonus > 0) drawMoneyRow(tr("Bonus Kehadiran", "Attendance Bonus"), payslip.attendance_bonus)
        if (payslip.commission_bonus > 0) drawMoneyRow(tr("Komisi / Bonus", "Commission / Bonus"), payslip.commission_bonus)
        if (payslip.reimbursement_amount > 0) drawMoneyRow("Reimbursement", payslip.reimbursement_amount)
        canvas.drawLine(margin, y - 6f, pageWidth - margin, y - 6f, linePaint)
        y += 6f
        drawMoneyRow(tr("Total Pendapatan Kotor", "Gross Earnings"), payslip.gross_earnings, bold = true)

        y += 10f
        // Deductions
        canvas.drawText(tr("POTONGAN (DEDUCTIONS)", "DEDUCTIONS"), margin, y, sectionPaint)
        y += 16f
        if (payslip.bpjs_kes_employee > 0) drawMoneyRow(tr("BPJS Kesehatan (1%)", "BPJS Health (1%)"), payslip.bpjs_kes_employee)
        if (payslip.bpjs_jht_employee > 0) drawMoneyRow("BPJS JHT (2%)", payslip.bpjs_jht_employee)
        if (payslip.bpjs_jp_employee > 0) drawMoneyRow("BPJS JP (1%)", payslip.bpjs_jp_employee)
        if (payslip.pph21_amount > 0) drawMoneyRow("PPh 21 (${payslip.pph21_method ?: "TER"})", payslip.pph21_amount)
        if (payslip.kasbon_deduction > 0) drawMoneyRow(tr("Cicilan Kasbon", "Salary Advance"), payslip.kasbon_deduction)
        if (payslip.late_deduction > 0) drawMoneyRow(tr("Potongan Terlambat", "Late Deduction"), payslip.late_deduction)
        if (payslip.unpaid_leave_deduction > 0) drawMoneyRow(tr("Cuti Tidak Berbayar", "Unpaid Leave"), payslip.unpaid_leave_deduction)
        if (payslip.alpha_deduction > 0) drawMoneyRow(tr("Alpa / Tanpa Keterangan", "Absence Deduction"), payslip.alpha_deduction)
        if (payslip.other_deductions > 0) drawMoneyRow(tr("Potongan Lainnya", "Other Deductions"), payslip.other_deductions)
        canvas.drawLine(margin, y - 6f, pageWidth - margin, y - 6f, linePaint)
        y += 6f
        drawMoneyRow(tr("Total Potongan", "Total Deductions"), payslip.total_deductions, bold = true)

        y += 14f
        canvas.drawLine(margin, y - 6f, pageWidth - margin, y - 6f, darkLinePaint)
        y += 10f
        val netPaint = Paint(titlePaint).apply { textSize = 13f }
        val netRightPaint = Paint(netPaint).apply { textAlign = Paint.Align.RIGHT }
        canvas.drawText(tr("GAJI BERSIH (TAKE HOME PAY)", "TAKE HOME PAY"), margin, y, netPaint)
        canvas.drawText(Formatters.formatRupiah(payslip.take_home_pay), pageWidth - margin, y, netRightPaint)

        y += 28f
        canvas.drawText(
            "${tr("Disetujui oleh", "Authorized by")}: ${payslip.approver_name ?: payslip.company_name ?: "HR / Finance"}",
            margin,
            y,
            subtitlePaint
        )

        doc.finishPage(page)

        val dir = File(context.cacheDir, "payslips").apply { mkdirs() }
        val safeTitle = (payslip.run_title ?: payslip.id).replace(Regex("[^A-Za-z0-9_-]"), "_")
        val file = File(dir, "SlipGaji_${safeTitle}.pdf")
        FileOutputStream(file).use { out ->
            doc.writeTo(out)
        }
        doc.close()

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(viewIntent, tr("Buka Slip Gaji PDF", "Open Payslip PDF"))
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)

        return file
    }
}
